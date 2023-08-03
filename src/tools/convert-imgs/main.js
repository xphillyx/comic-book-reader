/**
 * @license
 * Copyright 2020-2023 Álvaro García
 * www.binarynonsense.com
 * SPDX-License-Identifier: BSD-2-Clause
 */

const { BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const core = require("../../core/main");
const { _ } = require("../../shared/main/i18n");

const { FileExtension, FileDataType } = require("../../shared/main/constants");
const { fork } = require("child_process");
const FileType = require("file-type");
const fileUtils = require("../../shared/main/file-utils");
const fileFormats = require("../../shared/main/file-formats");

///////////////////////////////////////////////////////////////////////////////
// SETUP //////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let g_isInitialized = false;

let g_cancel = false;
let g_worker;

function init() {
  if (!g_isInitialized) {
    initOnIpcCallbacks();
    initHandleIpcCallbacks();
    g_isInitialized = true;
  }
}

exports.open = function () {
  // called by switchTool when opening tool
  init();
  const data = fs.readFileSync(path.join(__dirname, "index.html"));
  sendIpcToCoreRenderer("replace-inner-html", "#tools", data.toString());

  updateLocalizedText();

  sendIpcToRenderer("show", fileUtils.getDesktopFolderPath());

  updateLocalizedText();
};

exports.close = function () {
  // called by switchTool when closing tool
  sendIpcToRenderer("close-modal");
  sendIpcToRenderer("hide"); // clean up

  if (g_worker !== undefined) {
    g_worker.kill();
    g_worker = undefined;
  }
  fileUtils.cleanUpTempFolder();
};

exports.onResize = function () {
  sendIpcToRenderer("update-window");
};

exports.onMaximize = function () {
  sendIpcToRenderer("update-window");
};

function onCloseClicked() {
  core.switchTool("reader");
}

///////////////////////////////////////////////////////////////////////////////
// IPC SEND ///////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function sendIpcToRenderer(...args) {
  core.sendIpcToRenderer("tool-convert-imgs", ...args);
}

function sendIpcToCoreRenderer(...args) {
  core.sendIpcToRenderer("core", ...args);
}

function sendIpcToPreload(...args) {
  core.sendIpcToPreload(...args);
}

///////////////////////////////////////////////////////////////////////////////
// IPC RECEIVE ////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

let g_onIpcCallbacks = {};

exports.onIpcFromRenderer = function (...args) {
  const callback = g_onIpcCallbacks[args[0]];
  if (callback) callback(...args.slice(1));
  return;
};

function on(id, callback) {
  g_onIpcCallbacks[id] = callback;
}

function initOnIpcCallbacks() {
  on("close", () => {
    onCloseClicked();
  });

  on("choose-file", (defaultPath) => {
    try {
      let allowMultipleSelection = true;
      let allowedFileTypesName = "Image Files";
      let allowedFileTypesList = [
        FileExtension.JPG,
        FileExtension.JPEG,
        FileExtension.PNG,
        FileExtension.WEBP,
        FileExtension.BMP,
        FileExtension.AVIF,
      ];
      let filePathsList = fileUtils.chooseOpenFiles(
        core.getMainWindow(),
        defaultPath,
        allowedFileTypesName,
        allowedFileTypesList,
        allowMultipleSelection
      );
      if (filePathsList === undefined) {
        return;
      }
      for (let index = 0; index < filePathsList.length; index++) {
        const filePath = filePathsList[index];
        let stats = fs.statSync(filePath);
        if (!stats.isFile()) continue; // avoid folders accidentally getting here
        (async () => {
          sendIpcToRenderer("add-file", filePath);
        })();
      }
    } catch (err) {
      // TODO: do something?
    }
  });

  on("choose-folder", (inputFilePath, outputFolderPath) => {
    let defaultPath;
    if (outputFolderPath !== undefined) {
      defaultPath = outputFolderPath;
    } else if (inputFilePath !== undefined) {
      defaultPath = path.dirname(inputFilePath);
    }
    let folderList = fileUtils.chooseFolder(core.getMainWindow(), defaultPath);
    if (folderList === undefined) {
      return;
    }
    let folderPath = folderList[0];
    if (folderPath === undefined || folderPath === "") return;

    sendIpcToRenderer("change-output-folder", folderPath);
  });

  /////////////////////////

  on("cancel", () => {
    if (!g_cancel) {
      g_cancel = true;
    }
  });

  on(
    "start",
    (
      inputFiles,
      outputScale,
      outputQuality,
      outputFormat,
      outputFolderPath
    ) => {
      start(
        inputFiles,
        outputScale,
        outputQuality,
        outputFormat,
        outputFolderPath
      );
    }
  );

  on("stop-error", (err) => {
    stopError(err);
  });

  on("end", (wasCanceled, numFiles, numErrors, numAttempted) => {
    if (!wasCanceled) {
      sendIpcToRenderer(
        "modal-update-title-text",
        _("tool-shared-modal-title-conversion-finished")
      );

      if (numErrors > 0) {
        sendIpcToRenderer(
          "update-info-text",
          _(
            "tool-shared-modal-info-conversion-error-num-files",
            numErrors,
            numFiles
          )
        );
      } else {
        sendIpcToRenderer(
          "update-info-text",
          _("tool-shared-modal-info-conversion-success-num-files", numFiles)
        );
      }
    } else {
      sendIpcToRenderer(
        "modal-update-title-text",
        _("tool-shared-modal-title-conversion-canceled")
      );
      sendIpcToRenderer(
        "update-info-text",
        _(
          "tool-shared-modal-info-conversion-results",
          numAttempted - numErrors,
          numErrors,
          numFiles - numAttempted
        )
      );
    }

    sendIpcToRenderer("show-result");
  });
}

// HANDLE

let g_handleIpcCallbacks = {};

async function handleIpcFromRenderer(...args) {
  const callback = g_handleIpcCallbacks[args[0]];
  if (callback) return await callback(...args.slice(1));
  return;
}
exports.handleIpcFromRenderer = handleIpcFromRenderer;

function handle(id, callback) {
  g_handleIpcCallbacks[id] = callback;
}

function initHandleIpcCallbacks() {
  // handle(
  //   "pdf-save-dataurl-to-file",
  //   async (dataUrl, dpi, folderPath, pageNum) => {
  //     try {
  //       const { changeDpiDataUrl } = require("changedpi");
  //       let img = changeDpiDataUrl(dataUrl, dpi);
  //       let data = img.replace(/^data:image\/\w+;base64,/, "");
  //       let buf = Buffer.from(data, "base64");
  //       let filePath = path.join(folderPath, pageNum + "." + FileExtension.JPG);
  //       fs.writeFileSync(filePath, buf, "binary");
  //       return undefined;
  //     } catch (error) {
  //       return error;
  //     }
  //   }
  // );
}

///////////////////////////////////////////////////////////////////////////////
// TOOL ///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function stopError(error) {
  sendIpcToRenderer("update-log-text", error);
  sendIpcToRenderer(
    "update-log-text",
    _("tool-shared-modal-log-conversion-error")
  );
  sendIpcToRenderer("finished-error");
}

function stopCancel() {
  fileUtils.cleanUpTempFolder();
  sendIpcToRenderer(
    "update-log-text",
    _("tool-shared-modal-log-conversion-canceled")
  );
  sendIpcToRenderer("finished-canceled");
}

async function start(
  imgFiles,
  outputScale,
  outputQuality,
  outputFormat,
  outputFolderPath
) {
  try {
    g_cancel = false;
    outputScale = parseInt(outputScale);
    outputQuality = parseInt(outputQuality);
    let numErrors = 0;
    let numFiles = imgFiles.length;

    sendIpcToRenderer(
      "modal-update-title-text",
      _("tool-shared-modal-title-converting")
    );
    sendIpcToRenderer("update-info-text", "");
    sendIpcToRenderer(
      "update-log-text",
      _("tool-shared-modal-log-converting-images") + "..."
    );

    const sharp = require("sharp");

    let tempFolderPath = fileUtils.createTempFolder();
    // avoid EBUSY error on windows
    sharp.cache(false);
    for (let index = 0; index < imgFiles.length; index++) {
      try {
        if (g_cancel === true) {
          stopCancel(index);
          return;
        }
        let originalFilePath = imgFiles[index].path;
        let filePath = path.join(
          tempFolderPath,
          path.basename(imgFiles[index].path)
        );
        fs.copyFileSync(imgFiles[index].path, filePath);
        let fileName = path.basename(filePath, path.extname(filePath));
        let outputFilePath = path.join(
          outputFolderPath,
          fileName + "." + outputFormat
        );
        let i = 1;
        while (fs.existsSync(outputFilePath)) {
          i++;
          outputFilePath = path.join(
            outputFolderPath,
            fileName + "(" + i + ")." + outputFormat
          );
        }
        // resize first if needed
        if (outputScale < 100) {
          if (g_cancel === true) {
            stopCancel(index);
            return;
          }
          sendIpcToRenderer(
            "update-log-text",
            _("tool-shared-modal-log-resizing-image") + ": " + originalFilePath
          );
          let tmpFilePath = path.join(
            tempFolderPath,
            fileName + "." + FileExtension.TMP
          );
          let data = await sharp(filePath).metadata();
          await sharp(filePath)
            .withMetadata()
            .resize(Math.round(data.width * (outputScale / 100)))
            .toFile(tmpFilePath);

          fs.unlinkSync(filePath);
          fileUtils.moveFile(tmpFilePath, filePath);
        }
        // convert
        sendIpcToRenderer(
          "update-log-text",
          _("tool-shared-modal-log-converting-image") + ": " + originalFilePath
        );
        sendIpcToRenderer(
          "update-log-text",
          _("tool-ec-modal-log-extracting-to") + ": " + outputFilePath
        );
        if (outputFormat === FileExtension.JPG) {
          await sharp(filePath)
            .withMetadata()
            .jpeg({
              quality: outputQuality,
            })
            .toFile(outputFilePath);
        } else if (outputFormat === FileExtension.PNG) {
          if (outputQuality < 100) {
            await sharp(filePath)
              .withMetadata()
              .png({
                quality: outputQuality,
              })
              .toFile(outputFilePath);
          } else {
            await sharp(filePath).png().toFile(outputFilePath);
          }
        } else if (outputFormat === FileExtension.WEBP) {
          await sharp(filePath)
            .withMetadata()
            .webp({
              quality: outputQuality,
            })
            .toFile(outputFilePath);
        } else if (outputFormat === FileExtension.AVIF) {
          await sharp(filePath)
            .withMetadata()
            .avif({
              quality: outputQuality,
            })
            .toFile(outputFilePath);
        }
        fs.unlinkSync(filePath);
      } catch (err) {
        sendIpcToRenderer("update-log-text", err);
        numErrors++;
      }
    }
    // DONE /////////////////////
    fileUtils.cleanUpTempFolder();
    sendIpcToRenderer(
      "modal-update-title-text",
      _("tool-shared-modal-title-conversion-finished")
    );
    if (numErrors > 0) {
      sendIpcToRenderer(
        "update-info-text",
        _(
          "tool-shared-modal-info-conversion-error-num-files",
          numErrors,
          numFiles
        )
      );
    } else {
      sendIpcToRenderer(
        "update-info-text",
        _("tool-shared-modal-info-conversion-success-num-files", numFiles)
      );
    }
    sendIpcToRenderer("show-result");
  } catch (err) {
    stopError(err);
  }
}

///////////////////////////////////////////////////////////////////////////////
// LOCALIZATION ///////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function updateLocalizedText() {
  sendIpcToRenderer(
    "update-localization",
    getLocalization(),
    getTooltipsLocalization()
  );
}
exports.updateLocalizedText = updateLocalizedText;

function getTooltipsLocalization() {
  return [
    {
      id: "tool-ci-tooltip-output-size",
      text: _("tool-shared-tooltip-output-scale"),
    },
    {
      id: "tool-ci-tooltip-output-folder",
      text: _("tool-shared-tooltip-output-folder"),
    },
    {
      id: "tool-ci-tooltip-remove-from-list",
      text: _("tool-shared-tooltip-remove-from-list"),
    },
  ];
}

function getLocalization() {
  return [
    {
      id: "tool-ci-title-text",
      text: _("tool-ci-title").toUpperCase(),
    },
    {
      id: "tool-ci-back-button-text",
      text: _("tool-shared-ui-back-button").toUpperCase(),
    },
    {
      id: "tool-ci-start-button-text",
      text: _("tool-shared-ui-convert").toUpperCase(),
    },
    //////////////////////////////////////////////
    {
      id: "tool-ci-section-general-options-text",
      text: _("tool-shared-ui-general-options"),
    },
    //////////////////////////////////////////////
    {
      id: "tool-ci-input-options-text",
      text: _("tool-shared-ui-input-options"),
    },
    {
      id: "tool-ci-input-files-text",
      text: _("tool-shared-ui-input-files"),
    },
    {
      id: "tool-ci-add-file-button-text",
      text: _("tool-shared-ui-add").toUpperCase(),
    },
    //////////////////////////////////////////////
    {
      id: "tool-ci-output-options-text",
      text: _("tool-shared-ui-output-options"),
    },
    {
      id: "tool-ci-output-image-scale-text",
      text: _("tool-shared-ui-output-options-scale"),
    },
    {
      id: "tool-ci-output-image-format-text",
      text: _("tool-shared-ui-output-options-image-format"),
    },
    {
      id: "tool-ci-output-image-quality-text",
      text: _("tool-shared-ui-output-options-image-quality"),
    },
    {
      id: "tool-ci-output-folder-text",
      text: _("tool-shared-ui-output-folder"),
    },
    {
      id: "tool-ci-change-folder-button-text",
      text: _("tool-shared-ui-change").toUpperCase(),
    },

    //////////////////////////////////////////////

    {
      id: "tool-ci-modal-close-button-text",
      text: _("tool-shared-ui-close").toUpperCase(),
    },
    {
      id: "tool-ci-modal-cancel-button-text",
      text: _("tool-shared-ui-cancel").toUpperCase(),
    },
  ];
}