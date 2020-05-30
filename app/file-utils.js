const path = require("path");
const os = require("os");
const fs = require("fs");

const AdmZip = require("adm-zip");

const { app, dialog } = require("electron");

const deleteTempFolderRecursive = function (folderPath) {
  //console.log("deleteFolderRecursive: " + folderPath);
  if (fs.existsSync(folderPath)) {
    if (!folderPath.startsWith(os.tmpdir())) {
      // safety check
      return;
    }
    let files = fs.readdirSync(folderPath);
    //console.log(files.length);
    files.forEach((file) => {
      //console.log(file);
      const entryPath = path.join(folderPath, file);
      if (fs.lstatSync(entryPath).isDirectory()) {
        deleteTempFolderRecursive(entryPath);
      } else {
        fs.unlinkSync(entryPath); // delete the file
      }
    });
    fs.rmdirSync(folderPath);
    console.log("deletedfolder: " + folderPath);
  }
};

function chooseFile(window) {
  let imagePath = dialog.showOpenDialogSync(window, {
    filters: [
      {
        name: "Comic Book Files",
        extensions: ["cbz", "cbr", "pdf"],
        //extensions: ["cbz", "cbr", "zip", "rar", "pdf"],
      },
    ],
  });
  return imagePath;
}
exports.chooseFile = chooseFile;

function hasImageExtension(filePath) {
  const allowedFileExtensions = [".jpg", ".jpeg", ".png"];
  let fileExtension = path.extname(filePath).toLowerCase();
  for (i = 0; i < allowedFileExtensions.length; i++) {
    if (fileExtension === allowedFileExtensions[i]) {
      return true;
    }
  }
  return false;
}

const getImageFilesInFolderRecursive = function (folderPath) {
  let filesArray = [];
  let dirs = [];

  if (fs.existsSync(folderPath)) {
    let nodes = fs.readdirSync(folderPath);
    nodes.forEach((node) => {
      const nodePath = path.join(folderPath, node);
      if (fs.lstatSync(nodePath).isDirectory()) {
        dirs.push(nodePath); // check later so this folder's imgs come first
      } else {
        if (hasImageExtension(nodePath)) {
          filesArray.push(nodePath);
        }
      }
    });
    // now check inner folders
    dirs.forEach((dir) => {
      filesArray = filesArray.concat(getImageFilesInFolderRecursive(dir));
    });
  }
  return filesArray;
};
exports.getImageFilesInFolderRecursive = getImageFilesInFolderRecursive;

function getImageFilesInFolder(folderPath) {
  if (fs.existsSync(folderPath)) {
    let filesInFolder = fs.readdirSync(folderPath);
    if (filesInFolder.length === 0) {
      console.log("no files found in dir");
      return [];
    } else {
      return filesInFolder.filter(hasImageExtension);
    }
  } else {
    console.log("folder doesn't exist");
    return [];
  }
}
//exports.getImageFilesInFolder = getImageFilesInFolder;

function extractRar(filePath) {
  const unrar = require("node-unrar-js");
  cleanUpTempFolder();
  createTempFolder();
  console.log(tempFolder);

  //ref: https://github.com/YuJianrong/node-unrar.js
  let extractor = unrar.createExtractorFromFile(filePath, tempFolder);
  extractor.extractAll();

  console.log("rar file extracted");
  return tempFolder;
}
exports.extractRar = extractRar;

function getRarEntriesList(filePath) {
  // Read the archive file into a typedArray
  var buf = Uint8Array.from(fs.readFileSync(filePath)).buffer;
  var extractor = unrar.createExtractorFromData(buf);

  var list = extractor.getFileList();
  list.forEach(function (rarEntry) {
    console.log(rarEntry.toString());
  });
  if (list[0].state === "SUCCESS") {
    // list[1].arcHeader...
    // list[1].fileHeaders[...]
  }
  // var extracted = extractor.extractAll();
  // var extracted = extractor.extractFiles(["1.txt", "1.txt"], "password")();
  // if (list[0].state === "SUCCESS") {
  //   // list[1].arcHeader...
  //   // list[1].files[0].fileHeader: ..
  //   // if (list[1].files[0].extract[0].state === "SUCCESS") {
  //   //   list[1].files[0].extract[1] // Uint8Array
  //   // }
  // }
}

function getZipEntriesList(filePath) {
  let zip = new AdmZip(filePath);
  let zipEntries = zip.getEntries();
  let imgEntries = [];
  zipEntries.forEach(function (zipEntry) {
    if (hasImageExtension(zipEntry.entryName)) {
      imgEntries.push(zipEntry.entryName);
    }
  });
  // imgEntries.forEach(function (entryName) {
  //   console.log(entryName);
  // });
  return imgEntries;
}
exports.getZipEntriesList = getZipEntriesList;

function extractZipEntryData(zipPath, entryName) {
  let zip = new AdmZip(zipPath);
  return zip.readFile(entryName);
}
exports.extractZipEntryData = extractZipEntryData;

function extractZip(filePath) {
  cleanUpTempFolder();
  createTempFolder();
  console.log(tempFolder);

  // ref: https://github.com/cthackers/adm-zip/wiki/ADM-ZIP-Introduction
  let zip = new AdmZip(filePath);
  const imageData = zip.readFile("");
  zip.extractAllTo(tempFolder, true);
  console.log("zip file extracted");
  return tempFolder;
}
exports.extractZip = extractZip;

// TEMP FOLDER ////////////

let tempFolder; // = os.tmpdir();

function getTempFolder() {
  return tempFolder;
}
exports.getTempFolder = getTempFolder;

function createTempFolder() {
  tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), "comic-book-reader-"));
  console.log("temp folder created: " + tempFolder);
}
exports.createTempFolder = createTempFolder;

function cleanUpTempFolder() {
  if (tempFolder === undefined) return;
  // console.log("cleaning folder: " + tempFolder);
  const files = fs.readdirSync(tempFolder);
  deleteTempFolderRecursive(tempFolder);
}
exports.cleanUpTempFolder = cleanUpTempFolder;
