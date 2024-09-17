/* SPDX-License-Identifier: Apache-2.0
   Copyright © 2023 Sander Stolk */

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
          ParentClassCode: Onto2bsdd.codeFromName(
            Onto2bsdd.getLocalname(csvObject.ontoParentClass)
          ),
          // RelatedIfcEntityNamesList: [csvObject.ifcClassLabel],
          Status: "Preview",
          ClassRelations: [],
          ClassProperties: [],
        };
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
            Code: Onto2bsdd.codeFromName(
              Onto2bsdd.getLocalname(csvObject.ontoPropertyURI)
            ),
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
          Uid: resultPropertyObject.Code,
          PropertySet: result.DictionaryCode,
          PropertyType: "Property",
        };
        if (!Onto2bsdd.isInBsddNamespace(csvObject.ontoPropertyURI)) {
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
        // if (!Onto2bsdd.isInBsddNamespace(csvObject.mappedClassURI)) {
        //   classRelation.OwnedUri = csvObject.mappedClassURI;
        // }

        // switch (csvObject.mappedClassRelation) {
        //   case "isSpecializationOf":
        //     resultIfcRelationObject.RelationType = "IsChildOf";
        //     break;
        //   case "isGeneralizationOf":
        //     resultIfcRelationObject.RelationType = "IsParentOf";
        //     break;
        //   case "isRelatedTo":
        //     resultIfcRelationObject.RelationType = "HasReference";
        //     break;
        //   default:
        //     break;
        // }
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
   * @returns {boolean} - Returns true if the URI starts with "https://identifier.buildingsmart.org/", otherwise false.
   */
  static isInBsddNamespace(uri) {
    return uri.startsWith("https://identifier.buildingsmart.org/");
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
