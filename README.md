# onto2bsdd
Tooling to transform an ontology to the [JSON import datamodel](https://github.com/buildingSMART/bSDD/blob/master/Documentation/bSDD%20JSON%20import%20model.md) used in the buildingSMART Data Dictionary.

## Give it a try
* Download the source code
* Store the source code (uncompressed) in a folder on your local computer or on webhosting
* Open convert.html in an internet browser
* On this newly opened webpage
  * adjust the metadata in the 'header' to represent the organisation/ontology concerned [optional]
  * select a CSV file containing information on the ontology; adhering to a specific structure (*)
* The JSON importmodel datamodel of the bSDD is automatically generated and downloaded as a file

(*) See the example CSV of (a part of) the [Waternet ontology](https://otl.waternet.nl) in the subfolder "onto/waternet". This folder also includes the SPARQL query used to obtain that CSV and the results of the transformation to the JSON importdatamodel of the bSDD.

## Technical documentation
For further details on the tooling and its use, we refer the reader to the [technical report](https://github.com/ssstolk/onto2bsdd/blob/main/docs/Towards%20ontology-driven%20information%20exchange%20at%20Waternet.pdf) included in the docs folder.
