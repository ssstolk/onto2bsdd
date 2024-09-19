/* SPDX-License-Identifier: Apache-2.0
   Copyright © 2023 Sander Stolk */

const BSDD_NAMESPACE = "https://identifier.buildingsmart.org/";

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
          // RelatedIfcEntityNamesList: [csvObject.ifcClassLabel],
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
            DataType: bsddDatatype,
            Definition: csvObject.ontoPropertyDefinition,
            Name: csvObject.ontoPropertyPrefLabel,
            OwnedUri: csvObject.ontoPropertyURI,
          };
          resultProperties.push(resultPropertyObject);
        }

        const classProperty = {
          Code: md5(
            resultClassificationObject.Code + "-" + resultPropertyObject.Code
          ),
          PropertyCode: resultPropertyObject.Code,
          Uid: Onto2bsdd.getLocalname(resultPropertyObject.OwnedUri),
          PropertySet: result.DictionaryCode,
          PropertyType: "Property",
        };
        if (Onto2bsdd.isInBsddNamespace(csvObject.mappedClassURI)) {
          Onto2bsdd.combineUris(
            resultPropertyObject.Code,
            csvObject.ontoPropertyURI,
            "prop"
          );
        } else {
          classProperty.OwnedUri = csvObject.ontoPropertyURI;
        }
        resultClassificationObject.ClassProperties.push(classProperty);
      }

      // Only add class relations if the related class is in the bSDD namespace
      // because we don't know the URI of the related class on bSDD
      // if we do have that information we can also add the OwnedUri property
      if (
        Onto2bsdd.isInBsddNamespace(csvObject.mappedClassURI) &&
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
    }

    result.Classes = resultClassifications;
    result.Properties = resultProperties;
    // result.Materials = resultMaterials;

    Onto2bsdd.pruneInternalReferences(result);
    return JSON.stringify(result, null, 2);
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
   * that are not alphanumeric, underscores, or hyphens.
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
    code = code.replace(/[^a-zA-Z0-9_-]/g, "");

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
