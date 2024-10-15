/* SPDX-License-Identifier: Apache-2.0
   Copyright © 2023 Sander Stolk */

const BSDD_NAMESPACE = "https://identifier.buildingsmart.org/";
const BSDD_IFC_NAMESPACE =
  "https://identifier.buildingsmart.org/uri/buildingsmart/ifc";

class Onto2bsdd {
  /* Transforms input CSV content to bSDD in its JSON import model format.
            The CSV content is expected to have a header with the following columns:
            - ontoClassPrefLabel
            - ontoClassURI
            - ontoClassDefinition
            - mappedClassRelation
            - mappedClassRelationURI (unused)
            - mappedClassURI
            - ontoParentClassPrefLabel (unused)
            - ontoParentClass
            - ontoPropertyURI
            - ontoPropertyPrefLabel
            - ontoPropertyDatatypeLabel
            - ontoPropertyDatatype         
   
            For documentation on the bSDD import model, see: 
            https://github.com/buildingSMART/bSDD/blob/master/Documentation/bSDD%20JSON%20import%20model.md .
         */
  static fromCSV(input, header = {}) {
    const csvObjects = $.csv.toObjects(input); // see https://github.com/evanplaice/jquery-csv/#documentation
    console.log(JSON.stringify(csvObjects));

    const result = JSON.parse(JSON.stringify(header));

    // // set release date to now
    // result.ReleaseDate = new Date().toISOString();

    const dictionaryUri = result.DictionaryUri;
    const resultClassifications = [];
    const resultProperties = [];
    // const resultMaterials = [];

    for (const csvObject of csvObjects) {
      let resultClassificationObject = Onto2bsdd.getObjectWithProperty(
        resultClassifications,
        "OwnedUri",
        csvObject.ontoClassURI
      );

      if (!resultClassificationObject) {
        resultClassificationObject = {
          ClassType: "Class",
          Code: Onto2bsdd.codeFromName(
            Onto2bsdd.getLocalname(csvObject.ontoClassURI)
          ),
          Definition: csvObject.ontoClassDefinition,
          Name: csvObject.ontoClassPrefLabel,
          OwnedUri: csvObject.ontoClassURI,
          Status: "Preview",
          ClassRelations: [],
          ClassProperties: [],
        };

        if (csvObject.ontoParentClass) {
          resultClassificationObject.ParentClassCode = Onto2bsdd.codeFromName(
            Onto2bsdd.getLocalname(csvObject.ontoParentClass)
          );
        }

        resultClassifications.push(resultClassificationObject);
      }

      if (csvObject.ontoPropertyURI) {
        let resultPropertyObject = Onto2bsdd.getObjectWithProperty(
          resultProperties,
          "OwnedUri",
          csvObject.ontoPropertyURI
        );
        if (!resultPropertyObject) {
          const bsddDatatype =
            csvObject.ontoPropertyDatatypeLabel == "QuantityValue"
              ? "Real"
              : csvObject.ontoPropertyDatatypeLabel == "gYear"
              ? "Time"
              : "String";
          resultPropertyObject = {
            Code: Onto2bsdd.codeFromName(csvObject.ontoPropertyPrefLabel),
            Name: csvObject.ontoPropertyPrefLabel,
            Definition: csvObject.ontoPropertyDefinition,
            DataType: bsddDatatype,
            OwnedUri: csvObject.ontoPropertyURI,
            Uid: Onto2bsdd.getLocalname(
              csvObject.ontoPropertyURI
            ),
          };
          resultProperties.push(resultPropertyObject);
        }
        const classPropertyCode = Onto2bsdd.generateFormattedUUID(
          resultClassificationObject.Code,
          resultPropertyObject.Uid
        );
        const classProperty = {
          Code: classPropertyCode,
          PropertyCode: resultPropertyObject.Code,
          PropertySet: result.DictionaryCode,
          PropertyType: "Property",
        };
        if (Onto2bsdd.isInBsddNamespace(csvObject.ontoPropertyURI)) {
          classProperty.OwnedUri = Onto2bsdd.combineUris(
            resultPropertyObject.Code,
            csvObject.ontoPropertyURI,
            "prop"
          );
        } else {
          classProperty.OwnedUri = Onto2bsdd.combineUris(
            classPropertyCode,
            csvObject.ontoPropertyURI,
            "prop"
          );
        }
        resultClassificationObject.ClassProperties.push(classProperty);
      }

      // Delete the "//" 5 lines below if:
	  //Only add class relations if the related class is in the bSDD namespace
      // because we don't know the URI of the related class on bSDD
      // if we do have that information we can also add the OwnedUri property
      if (
//        Onto2bsdd.isInBsddNamespace(csvObject.mappedClassURI) &&
        csvObject.mappedClassRelation
    ) {
        const classRelation = {
          RelationType: csvObject.mappedClassRelation,
          RelatedClassUri: csvObject.mappedClassURI,
        };

        if (Onto2bsdd.isInBsddNamespace(csvObject.mappedClassURI)) {
          classRelation.OwnedUri = Onto2bsdd.combineUris(
            csvObject.mappedClassURI,
            csvObject.ontoClassURI,
            "relclass"
          );
        } else {
          classRelation.OwnedUri = csvObject.mappedClassURI;
        }
        resultClassificationObject.ClassRelations.push(classRelation);
      }

      // Add related IFC entity names to the classification object
      const relatedIfcEntityNamesList =
        resultClassificationObject.ClassRelations.filter((relation) =>
          relation.RelatedClassUri.startsWith(BSDD_IFC_NAMESPACE)
        ).map((relation) => relation.RelatedClassUri.split("/").pop());

      if (relatedIfcEntityNamesList.length > 0) {
        resultClassificationObject.RelatedIfcEntityNamesList =
          relatedIfcEntityNamesList;
      }
    }

    result.Classes = resultClassifications;
    result.Properties = resultProperties;
    // result.Materials = resultMaterials;

    Onto2bsdd.pruneInternalReferences(result);
    return JSON.stringify(result, null, 2);
  }

  /**
   * Generates a formatted UUID based on the MD5 hash of the concatenation
   * of the classification code and property URI.
   *
   * @param {string} classificationCode - The code of the classification object.
   * @param {string} propertyUri - The URI of the property.
   * @returns {string} The formatted UUID.
   * @throws {TypeError} If the input parameters are not strings.
   */
  static generateFormattedUUID(classificationCode, propertyUri) {
    if (
      typeof classificationCode !== "string" ||
      typeof propertyUri !== "string"
    ) {
      throw new TypeError(
        "Both classificationCode and propertyUri must be strings"
      );
    }

    // Concatenate classificationCode and propertyUri with a hyphen
    const concatenatedString = `${classificationCode}-${propertyUri}`;

    // Generate the MD5 hash of the concatenated string
    const hash = md5(concatenatedString);

    // Format hash as a UUID
    const formattedUUID = `${hash.slice(0, 8)}-${hash.slice(
      8,
      12
    )}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;

    return formattedUUID;
  }

  /**
   * Combines a base URI with another URI and a specified URI type segment.
   * It cleans the URI and constructs a combined URI.
   *
   * @param {string} uri - The URI to be appended.
   * @param {string} baseUri - The base URI to which the other URI will be appended.
   * @param {string} [uriType='relclass'] - The URI type segment that links both URIs.
   * @returns {string} - The combined URI.
   */
  static combineUris(uri, baseUri, uriType = "relclass") {
    const cleanedUri = uri
      .replace(BSDD_NAMESPACE, "")
      .replace(/^https?:\/\//, "");

    const combinedUri = [baseUri, uriType, cleanedUri]
      .join("/")
      .replace(/\/{2,}/g, "/")
      .replace(":/", "://");

    return combinedUri;
  }

  /**
   * Converts a string into a valid bSDD code.
   *
   * The function replaces spaces with underscores and removes any characters
   * that are not alphanumeric, diacritics, underscores, hyphens, dots, or whitespace.
   *
   * @param {string} name - The string to convert into a valid bSDD code.
   * @returns {string} The converted bSDD code.
   * @throws {TypeError} If the input is not a string.
   */
  static codeFromName(name) {
    if (typeof name !== "string") {
      throw new TypeError("Input must be a string");
    }

    let code = name.replace(/ /g, "_");
    const allowedChars = /[^a-zA-Z0-9\s._-À-ž]/g;
    code = code.replace(allowedChars, "");

    return code;
  }

  /**
   * Checks if a given URI is within the buildingsmart namespace.
   *
   * @param {string} uri - The URI to check.
   * @returns {boolean} - Returns true if the URI starts with BSDD_NAMESPACE, otherwise false.
   */
  static isInBsddNamespace(uri) {
    if (typeof uri !== "string") return false;
    return uri.startsWith(BSDD_NAMESPACE);
  }

  /**
   * Extracts the local name from a given URI.
   *
   * The local name is the part of the URI after the last '#' or '/' character.
   *
   * @param {string} uri - The URI from which to extract the local name.
   * @returns {string|null} The local name extracted from the URI, or null if the input is not a string.
   */
  static getLocalname(uri) {
    if (typeof uri !== "string") return null;

    const trimmedUri = uri.trim();
    const delimiter = trimmedUri.includes("#") ? "#" : "/";
    const parts = trimmedUri.split(delimiter);

    return parts.pop() || null;
  }

  static getObjectWithProperty(containerObject, propertyName, propertyValue) {
    for (const object of containerObject) {
      if (object[propertyName] && object[propertyName] == propertyValue)
        return object;
    }
    return null;
  }

  static pruneInternalReferences(result) {
    for (const classification of result.Classes) {
      if (
        !Onto2bsdd.isPresent(classification.ParentClassCode, result.Classes)
      ) {
        classification.ParentClassCode = undefined;
      }
      for (const classificationProperty of classification.ClassProperties) {
        if (
          !Onto2bsdd.isPresent(
            classificationProperty.PropertyCode,
            result.Properties
          )
        ) {
          classificationProperty.PropertyCode = undefined;
        }
      }
    }
  }

  static isPresent(code, array) {
    if (!array || !code) {
      return false;
    }
    for (const e of array) {
      if (e.Code == code) {
        return true;
      }
    }
    return false;
  }
}
