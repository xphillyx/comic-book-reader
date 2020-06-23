const fs = require("fs");
const path = require("path");
const FileType = require("file-type");
const fileFormats = require("./file-formats");

process.on("message", (message) => {
  exportPage(message.data, message.outputFolderPath);
});

async function exportPage(fileData, outputFolderPath) {
  try {
    let buf;
    if (fileData.type === "zip") {
      buf = fileFormats.extractZipEntryData(
        fileData.path,
        fileData.pagesPaths[fileData.pageIndex]
      );
    } else if (fileData.type === "rar") {
      buf = fileFormats.extractRarEntryData(
        fileData.path,
        fileData.pagesPaths[fileData.pageIndex]
      );
    } else if (fileData.type === "epub") {
      buf = await fileFormats.extractEpubImageBuffer(
        fileData.path,
        fileData.pagesPaths[fileData.pageIndex]
      );
    }

    // mostly duplicated code from main's exportPageSaveBuffer because I
    // don't know how to send the buffer back (send doesn't seem to work
    // for binary data)
    if (buf === undefined) {
      process.send([false, "Error: exportPage empty buffer"]);
    } else {
      (async () => {
        let fileType = await FileType.fromBuffer(buf);
        let fileExtension = ".jpg";
        if (fileType !== undefined) {
          fileExtension = "." + fileType.ext;
        }
        let fileName =
          path.basename(fileData.name, path.extname(fileData.name)) +
          "_page_" +
          (fileData.pageIndex + 1);

        let outputFilePath = path.join(
          outputFolderPath,
          fileName + fileExtension
        );
        let i = 1;
        while (fs.existsSync(outputFilePath)) {
          i++;
          outputFilePath = path.join(
            outputFolderPath,
            fileName + "(" + i + ")" + fileExtension
          );
        }

        await new Promise((resolve, reject) =>
          fs.writeFile(outputFilePath, buf, "binary", (err) => {
            if (err === null) {
              resolve();
            } else {
              reject(err);
            }
          })
        );

        process.send([true, outputFilePath]);
      })();
    }
  } catch (err) {
    process.send([false, err]);
  }
}
