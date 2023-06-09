/* SPDX-License-Identifier: Apache-2.0
   Copyright © 2023 Sander Stolk */

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
    static fromCSV(input, header={}) {

        const csvObjects = $.csv.toObjects(input); // see https://github.com/evanplaice/jquery-csv/#documentation
        console.log(JSON.stringify(csvObjects));

        const result = JSON.parse(JSON.stringify(header));
        const resultClassifications = [];
        const resultProperties = [];
        const resultMaterials = [];
        
        for (const csvObject of csvObjects) {
            let resultClassificationObject = Onto2bsdd.getObjectWithProperty(resultClassifications, "OwnedUri", csvObject.ontoClassURI);
            
            if (!resultClassificationObject) {
                resultClassificationObject = { 
                    "ClassificationType": "Class",
                    "Code": Onto2bsdd.getLocalname(csvObject.ontoClassURI),
                    "Definition": csvObject.ontoClassDefinition,
                    "Name": csvObject.ontoClassPrefLabel,
                    "OwnedUri": csvObject.ontoClassURI,
                    "ParentClassificationCode": Onto2bsdd.getLocalname(csvObject.ontoParentClass),       
                    "RelatedIfcEntityNamesList": [ csvObject.ifcClassLabel ],
                    "ClassificationProperties": []      
                };
                resultClassifications.push(resultClassificationObject);
            }
            
            if (csvObject.ontoPropertyURI) {
                let resultPropertyObject = Onto2bsdd.getObjectWithProperty(resultProperties, "OwnedUri", csvObject.ontoPropertyURI);
                if (!resultPropertyObject) {
                    const bsddDatatype = (csvObject.ontoPropertyDatatypeLabel == "QuantityValue") ? "Real" : 
                        ((csvObject.ontoPropertyDatatypeLabel == "gYear") ? "Time" : "String");
                    resultPropertyObject = {
                        "Code": Onto2bsdd.getLocalname(csvObject.ontoPropertyURI),
                        "DataType": bsddDatatype,
                        "Definition": csvObject.ontoPropertyDefinition,
                        "Name": csvObject.ontoPropertyPrefLabel,
                        "OwnedUri": csvObject.ontoPropertyURI
                    };
                    resultProperties.push(resultPropertyObject);
                }
                
                const resultPropertyLinkObject = {
                    "Code": md5(resultClassificationObject.Code + "-" + resultPropertyObject.Code),
                    "PropertyCode": resultPropertyObject.Code,
                    "PropertySet": result.DomainName,
                    "PropertyType": "Property"
                };
                resultClassificationObject.ClassificationProperties.push(resultPropertyLinkObject);
            }
        }
        

        result.Classifications = resultClassifications;
        result.Properties = resultProperties;
        result.Materials = resultMaterials;
        
        Onto2bsdd.pruneInternalReferences(result);
        return JSON.stringify(result, null, 2);
    }


    static getLocalname(uri) {
        if (uri.includes("#")) return uri.split('#').pop(); 
        return uri.split('/').pop();
    }


    static getObjectWithProperty(containerObject, propertyName, propertyValue) {
        for (const object of containerObject) {
            if (object[propertyName] && object[propertyName] == propertyValue) return object;
        }
        return null;
    }
    
    static pruneInternalReferences(result) {
        for (const classification of result.Classifications) {
            if (!Onto2bsdd.isPresent(classification.ParentClassificationCode, result.Classifications)) {
                classification.ParentClassificationCode = undefined;
            }
            for (const classificationProperty of classification.ClassificationProperties) {
                if (!Onto2bsdd.isPresent(classificationProperty.PropertyCode, result.Properties)) {
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