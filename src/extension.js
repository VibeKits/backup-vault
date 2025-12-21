const vscode = require('vscode');
const path = require('path');
const BackupTreeDataProvider = require('./webview.js');
const FileOperations = require('./fileOperations.js');

let treeDataProvider = null;
let fileOps = null;

function activate(context) {
  // Create and register the tree data provider
  treeDataProvider = new BackupTreeDataProvider(context);
  global.treeDataProvider = treeDataProvider; // Make it globally accessible
  vscode.window.registerTreeDataProvider('backupVaultConfig', treeDataProvider);

  // Initialize file operations module
  fileOps = new FileOperations();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('backup-vault.run', async function () {
      if (!fileOps) {
        vscode.window.showErrorMessage('Backup Vault is not properly initialized.');
        return;
      }

      const settings = context.workspaceState.get('backupSettings', {
        sources: [],
        outputDir: '',
        packFiles: false,
        folderName: '',
        suffix: 'v'
      });

      console.log('Backup sources:', settings.sources);

      if (settings.sources.length === 0) {
        vscode.window.showErrorMessage('No sources selected. Please check items in the Backup Vault panel.');
        return;
      }

      if (!settings.outputDir) {
        const dirResult = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Select Output Directory'
        });
        if (dirResult && dirResult.length > 0) {
          settings.outputDir = dirResult[0].fsPath;
          context.workspaceState.update('backupSettings', settings);
        } else {
          return;
        }
      }

      const version = await vscode.window.showInputBox({
        prompt: 'Enter version suffix (e.g. 318 or v3.18)',
        ignoreFocusOut: true
      });
      if (!version) {
        vscode.window.showInformationMessage('Backup cancelled (no version).');
        return;
      }

      // Check if backup destination already exists
      const shouldPack = (settings.sources.length > 1) || settings.packFiles;
      let finalName;
      if (shouldPack) {
        finalName = `${settings.folderName}${settings.suffix}${version}`;
      } else {
        // Single file - insert suffix before extension (match PowerShell logic)
        const srcLeaf = path.basename(settings.sources[0]);
        const namePart = path.parse(srcLeaf).name;
        const extension = path.parse(srcLeaf).ext;
        finalName = `${namePart}${settings.suffix}${version}${extension}`;
      }
      const dst = path.join(settings.outputDir, finalName);

      console.log('Calculated destination:', dst);

      let forceOverwrite = false;
      const fs = require('fs');
      if (fs.existsSync(dst)) {
        console.log('Showing overwrite prompt for:', dst);
        const overwrite = await vscode.window.showWarningMessage(
          `A backup with version '${version}' already exists at:\n${dst}\n\nDo you want to overwrite it?`,
          { modal: true },
          'Overwrite',
          'Cancel'
        );

        console.log('Overwrite choice:', overwrite);

        if (overwrite !== 'Overwrite') {
          vscode.window.showInformationMessage('Backup cancelled.');
          return;
        }
        forceOverwrite = true;
      } else {
        console.log('No existing backup found, proceeding...');
      }

      // Show starting notification
      vscode.window.showInformationMessage(`Backup started (version: ${settings.suffix}${version}).`);

      try {
        // Use the new FileOperations module
        const result = await fileOps.createBackup({
          sources: settings.sources,
          outputDir: settings.outputDir,
          version: version,
          packFiles: shouldPack,
          folderName: settings.folderName,
          suffix: settings.suffix,
          force: forceOverwrite,
          deselected: Array.from(treeDataProvider.deselectedItems)
        });

        if (result.success) {
          const destName = path.basename(result.destination);
          vscode.window.showInformationMessage(`✅ Backup completed successfully! Created: ${destName}`);

          // Also show a secondary notification with the full path after a delay
          setTimeout(() => {
            vscode.window.showInformationMessage(`📁 Location: ${result.destination}`);
          }, 1500);
        } else {
          vscode.window.showErrorMessage('Backup failed with unknown error.');
        }
      } catch (error) {
        console.error('Backup failed:', error);
        vscode.window.showErrorMessage(`Backup failed: ${error.message}`);
      }
    }),

    vscode.commands.registerCommand('backup-vault.refresh', function () {
      treeDataProvider.refresh();
    }),

    vscode.commands.registerCommand('backup-vault.toggleSelection', function (item) {
      if (item && treeDataProvider) {
        treeDataProvider.toggleSelection(item);
      }
    }),

    vscode.commands.registerCommand('backup-vault.selectAll', function (item) {
      if (item && treeDataProvider) {
        treeDataProvider.toggleSelection(item);
      }
    }),

    vscode.commands.registerCommand('backup-vault.selectNone', function () {
      if (treeDataProvider) {
        treeDataProvider.selectedItems.clear();
        treeDataProvider.saveSettings();
        treeDataProvider.refresh();
      }
    }),

    vscode.commands.registerCommand('backup-vault.editOutputDir', async function () {
      if (!treeDataProvider) return;

      const result = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: treeDataProvider.outputDir ? vscode.Uri.file(treeDataProvider.outputDir) : undefined,
        openLabel: 'Select Output Directory'
      });

      if (result && result.length > 0) {
        treeDataProvider.outputDir = result[0].fsPath;
        treeDataProvider.saveSettings();
        treeDataProvider.refresh();
        vscode.window.showInformationMessage('Output directory updated!');
      }
    }),

    vscode.commands.registerCommand('backup-vault.editSendingDir', async function () {
      if (!treeDataProvider) return;

      const result = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: treeDataProvider.sendingDir ? vscode.Uri.file(treeDataProvider.sendingDir) : undefined,
        openLabel: 'Select Sending Directory'
      });

      if (result && result.length > 0) {
        treeDataProvider.sendingDir = result[0].fsPath;
        treeDataProvider.saveSettings();
        treeDataProvider.refresh();
        vscode.window.showInformationMessage('Sending directory updated!');
      }
    }),

    vscode.commands.registerCommand('backup-vault.editSuffix', async function () {
      if (!treeDataProvider) return;

      const result = await vscode.window.showInputBox({
        prompt: 'Enter suffix for backup versions (e.g., v, _, ver)',
        value: treeDataProvider.suffix,
        placeHolder: 'v'
      });

      if (result !== undefined) {
        treeDataProvider.suffix = result;
        treeDataProvider.saveSettings();
        treeDataProvider.refresh();
        vscode.window.showInformationMessage('Version suffix updated!');
      }
    }),

    vscode.commands.registerCommand('backup-vault.togglePack', async function () {
      if (!treeDataProvider) return;

      // Check if multiple items are selected
      if (treeDataProvider.selectedItems.size > 1) {
        // Multiple items selected - force packing and don't allow toggle
        treeDataProvider.packFiles = true;
        treeDataProvider.saveSettings();
        treeDataProvider.refresh();
        vscode.window.showInformationMessage('Multiple items selected - file packing is required!');
      } else {
        // Single item selected - allow normal toggle
        treeDataProvider.packFiles = !treeDataProvider.packFiles;
        treeDataProvider.saveSettings();
        treeDataProvider.refresh();
        vscode.window.showInformationMessage(`File packing ${treeDataProvider.packFiles ? 'enabled' : 'disabled'}!`);
      }
    }),

    vscode.commands.registerCommand('backup-vault.editFolderName', async function () {
      if (!treeDataProvider) return;

      const result = await vscode.window.showInputBox({
        prompt: 'Enter packing folder name',
        value: treeDataProvider.folderName,
        placeHolder: 'Backup'
      });

      if (result !== undefined) {
        treeDataProvider.folderName = result;
        treeDataProvider.saveSettings();
        treeDataProvider.refresh();
        vscode.window.showInformationMessage('Folder name updated!');
      }
    }),

    vscode.commands.registerCommand('backup-vault.selectionSummary', async function () {
      if (!treeDataProvider) {
        return 'No data provider';
      }

      const selectedItems = treeDataProvider.selectedItems;
      if (!selectedItems || selectedItems.size === 0) {
        return 'None selected';
      }

      let directFolders = 0;
      let directFiles = 0;
      let totalItems = 0;

      for (const itemPath of selectedItems) {
        try {
          const stats = require('fs').statSync(itemPath);
          if (stats.isDirectory()) {
            directFolders++;
            // Count all items in this directory recursively using FileOperations
            if (fileOps) {
              totalItems += await fileOps.countItemsInDirectory(itemPath);
            }
          } else {
            directFiles++;
            totalItems++;
          }
        } catch (error) {
          // Skip invalid paths
          continue;
        }
      }

      return `${directFolders} folders, ${directFiles} files (${totalItems} total)`;
    }),

    vscode.commands.registerCommand('backup-vault.sendFiles', async function () {
      if (!fileOps || !treeDataProvider) {
        vscode.window.showErrorMessage('Backup Vault is not properly initialized.');
        return;
      }

      // Get selected items from workspace tree, filtering out deselected items
      const selectedItems = Array.from(treeDataProvider.selectedItems).filter(itemPath =>
        !treeDataProvider.deselectedItems.has(itemPath)
      );
      if (selectedItems.length === 0) {
        vscode.window.showErrorMessage('No files selected. Please select files in the Backup Vault panel.');
        return;
      }

      // Check sending directory (destination)
      if (!treeDataProvider.sendingDir) {
        vscode.window.showErrorMessage('Sending directory not set. Please configure the sending directory in the Backup Generator panel.');
        return;
      }

      console.log('SendFiles: Selected items to send:', selectedItems.length, 'items');
      console.log('SendFiles: Destination directory:', treeDataProvider.sendingDir);

      // Check for potential overwrites
      const fs = require('fs');
      const path = require('path');
      const wouldOverwrite = selectedItems.some(itemPath => {
        const itemName = path.basename(itemPath);
        const destPath = path.join(treeDataProvider.sendingDir, itemName);
        return fs.existsSync(destPath);
      });

      if (wouldOverwrite) {
        const overwrite = await vscode.window.showWarningMessage(
          `Some files already exist in the sending directory and will be overwritten.\n\nSending directory: ${treeDataProvider.sendingDir}\n\nDo you want to continue?`,
          { modal: true },
          'Continue',
          'Cancel'
        );

        if (overwrite !== 'Continue') {
          vscode.window.showInformationMessage('Send files cancelled.');
          return;
        }
      }

      vscode.window.showInformationMessage(`Sending ${selectedItems.length} selected item(s) to sending directory...`);

      try {
        // Use the new FileOperations module
        const results = await fileOps.sendFiles({
          sources: selectedItems,
          sendingDir: treeDataProvider.sendingDir,
          deselected: Array.from(treeDataProvider.deselectedItems)
        });

        // Show final status
        if (results.successCount > 0 && results.errorCount === 0) {
          vscode.window.showInformationMessage(`✅ Send completed! ${results.successCount} item(s) sent successfully`);

          // Show destination info after a delay
          setTimeout(() => {
            vscode.window.showInformationMessage(`📁 Sent to: ${treeDataProvider.sendingDir}`);
          }, 1500);
        } else if (results.successCount > 0 && results.errorCount > 0) {
          vscode.window.showWarningMessage(`⚠️ Partially completed: ${results.successCount} item(s) sent, ${results.errorCount} failed. Check output for details.`);
        } else {
          vscode.window.showErrorMessage(`❌ Failed to send any items. Check console for details.`);
        }

        // Log errors if any
        if (results.errors && results.errors.length > 0) {
          console.error('Send files errors:', results.errors);
        }
      } catch (error) {
        console.error('Send files operation failed:', error);
        vscode.window.showErrorMessage(`Send files failed: ${error.message}`);
      }
    })
  );
}
exports.activate = activate;

function deactivate() {}
exports.deactivate = deactivate;
