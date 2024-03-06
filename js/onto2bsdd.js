/* SPDX-License-Identifier: Apache-2.0
   Copyright © 2023 Sander Stolk */

const DEFAULT_URI = "http://www.example.org/";
const OLD_IFC_URI = "buildingsmart/ifc-4.3/";
const NEW_IFC_URI = "buildingsmart/ifc/4.3/";

class Onto2bsdd {
  /* Transforms input CSV content to bSDD in its JSON import model format.
       The CSV content is expected to have a header with the following columns:
       - ontoClassPrefLabel
       - ontoClassURI
       - ontoClassDefinition
       - ifcClassLabel
       - ifcClassURI
       - ontoParentClassPrefLabel
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
      const ontoClassURI = replaceDefaultUri(
        csvObject.ontoClassURI,
        dictionaryUri
      );
      const ontoParentClass = replaceDefaultUri(
        csvObject.ontoParentClass,
        dictionaryUri
      );
      const ontoPropertyURI = replaceDefaultUri(
        csvObject.ontoPropertyURI,
        dictionaryUri
      );
      // const classCode = csvObject.ontoClassPrefLabel
      // .replace(/[#%\/\:\{\}\[\]\|;<>?`~\s]/g, "")
      // .toLowerCase(),

      let resultClassificationObject = Onto2bsdd.getObjectWithProperty(
        resultClassifications,
        "OwnedUri",
        ontoClassURI
      );

      if (!resultClassificationObject) {
        resultClassificationObject = {
          ClassType: "Class",
          Code: Onto2bsdd.getLocalname(ontoClassURI),
          Definition: csvObject.ontoClassDefinition,
          Name: csvObject.ontoClassPrefLabel,
          OwnedUri: ontoClassURI,
          ParentClassCode: Onto2bsdd.getLocalname(ontoParentClass),
          // RelatedIfcEntityNamesList: [csvObject.ifcClassLabel],
          Status: "Preview",
          ClassRelations: [],
          ClassProperties: [],
        };
        resultClassifications.push(resultClassificationObject);
      }

      if (ontoPropertyURI) {
        let resultPropertyObject = Onto2bsdd.getObjectWithProperty(
          resultProperties,
          "OwnedUri",
          ontoPropertyURI
        );
        if (!resultPropertyObject) {
          const bsddDatatype =
            csvObject.ontoPropertyDatatypeLabel == "QuantityValue"
              ? "Real"
              : csvObject.ontoPropertyDatatypeLabel == "gYear"
              ? "Time"
              : "String";
          resultPropertyObject = {
            Code: Onto2bsdd.getLocalname(ontoPropertyURI),
            DataType: bsddDatatype,
            Definition: csvObject.ontoPropertyDefinition,
            Name: csvObject.ontoPropertyPrefLabel,
            OwnedUri: ontoPropertyURI,
          };
          resultProperties.push(resultPropertyObject);
        }

        const classProperty = {
          // Code: md5(
          //   resultClassificationObject.Code + "-" + resultPropertyObject.Code
          // ),
          Code: resultPropertyObject.Code,
          PropertyCode: resultPropertyObject.Code,
          PropertySet: result.DictionaryCode,
          PropertyType: "Property",
        };
        if (ontoPropertyURI.includes(dictionaryUri)) {
          classProperty.OwnedUri = ontoPropertyURI;
        } else {
          classProperty.OwnedUri =
            dictionaryUri + "class-property-fake-uri-404";
        }
        resultClassificationObject.ClassProperties.push(classProperty);
      }

      if (csvObject.mappedClassURI && csvObject.mappedClassRelation) {
        const classRelation = {
          RelationType: csvObject.mappedClassRelation,
          RelatedClassUri: replaceIfcUri(csvObject.mappedClassURI),
        };
        if (csvObject.mappedClassURI.includes(dictionaryUri)) {
          classRelation.OwnedUri = csvObject.mappedClassURI;
        } else {
          classRelation.OwnedUri =
            dictionaryUri + "class-relation-fake-uri-404";
        }

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

  static getLocalname(uri) {
    if (uri.includes("#")) return uri.split("#").pop();
    return uri.split("/").pop();
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

function replaceDefaultUri(uri, dictionaryUri) {
  return uri ? uri.replace(DEFAULT_URI, dictionaryUri) : undefined;
}

function replaceIfcUri(uri) {
  return uri && uri.includes(OLD_IFC_URI)
    ? uri.replace(OLD_IFC_URI, NEW_IFC_URI)
    : uri;
}
