const vscode = require('vscode');
const cp = require('child_process');
const path = require('path');
const BackupTreeDataProvider = require('./webview.js');

let treeDataProvider = null;

function activate(context) {
  // Create and register the tree data provider
  treeDataProvider = new BackupTreeDataProvider(context);
  global.treeDataProvider = treeDataProvider; // Make it globally accessible
  vscode.window.registerTreeDataProvider('backupVaultConfig', treeDataProvider);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('backup-vault.run', async function () {
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
      console.log('Destination exists:', require('fs').existsSync(dst));

      let forceOverwrite = false;
      if (require('fs').existsSync(dst)) {
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

      // Build the command
      const script = path.join(__dirname, '..', 'scripts', 'backup_generator_script.ps1');
      let psCommand = `& '${script}' -Version '${version}' -BackupDir '${settings.outputDir}' -Suffix '${settings.suffix}'`;

      // Add force parameter if user approved overwrite
      if (forceOverwrite) {
        psCommand += ` -Force $true`;
      }

      console.log('Sources count:', settings.sources.length);
      console.log('Pack files:', settings.packFiles);

      if (settings.sources.length === 1) {
        console.log('Single source:', settings.sources[0]);
        psCommand += ` -Source '${settings.sources[0]}'`;
        if (settings.packFiles) {
          psCommand += ` -Pack $true -FolderName '${settings.folderName}'`;
        } else {
          psCommand += ` -Pack $false`;
        }
      } else {
        // Multiple sources - always pack
        console.log('Multiple sources:', settings.sources);
        psCommand += ` -Sources '${settings.sources.join(';')}' -Pack $true -FolderName '${settings.folderName}'`;
      }

      console.log('PowerShell command:', psCommand);

      // Show starting notification
      vscode.window.showInformationMessage(`Backup started (version: ${settings.suffix}${version}).`);

      // Execute PowerShell command silently
      const { exec } = require('child_process');
      exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, (error, stdout, stderr) => {
        console.log('Backup stdout:', stdout);
        if (stderr) console.error('Backup stderr:', stderr);

        if (error) {
          console.error('Backup execution error:', error);
          vscode.window.showErrorMessage(`Backup failed: ${error.message}`);
        } else if (stdout.includes('SUCCESS:')) {
          // Extract destination path from success message
          const successMatch = stdout.match(/SUCCESS: backup created at (.+)/);
          const destination = successMatch ? successMatch[1] : 'unknown location';
          vscode.window.showInformationMessage(`✅ Backup completed successfully at: ${destination}`);
        } else {
          vscode.window.showWarningMessage('Backup completed with warnings. Check output for details.');
        }
      });
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
        prompt: 'Enter folder name for packed backups',
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

    vscode.commands.registerCommand('backup-vault.selectionSummary', function () {
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
            // Count all items in this directory recursively
            totalItems += countItemsInDirectory(itemPath);
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
      if (!treeDataProvider) {
        vscode.window.showErrorMessage('Backup Vault is not initialized.');
        return;
      }

      // Get selected items from workspace tree
      const selectedItems = Array.from(treeDataProvider.selectedItems);
      if (selectedItems.length === 0) {
        vscode.window.showErrorMessage('No files selected. Please select files in the Backup Vault panel.');
        return;
      }

      // Check sending directory (destination)
      if (!treeDataProvider.sendingDir) {
        vscode.window.showErrorMessage('Sending directory not set. Please configure the sending directory in the Backup Generator panel.');
        return;
      }

      // Validate sending directory exists
      if (!require('fs').existsSync(treeDataProvider.sendingDir)) {
        vscode.window.showErrorMessage(`Sending directory does not exist: ${treeDataProvider.sendingDir}`);
        return;
      }

      try {
        const fs = require('fs');
        const path = require('path');

        console.log('SendFiles: Selected items to send:', selectedItems.length, 'items');
        console.log('SendFiles: Destination directory:', treeDataProvider.sendingDir);

        // Check for potential overwrites
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

        let successCount = 0;
        let errorCount = 0;

        for (const sourcePath of selectedItems) {
          try {
            // Validate source exists
            if (!fs.existsSync(sourcePath)) {
              console.warn(`Source does not exist, skipping: ${sourcePath}`);
              errorCount++;
              continue;
            }

            // Get the base name for destination
            const itemName = path.basename(sourcePath);
            const destPath = path.join(treeDataProvider.sendingDir, itemName);

            // Copy the item (file or directory) recursively, allowing overwrites
            copyItemRecursive(sourcePath, destPath);
            successCount++;
            console.log(`Successfully copied: ${sourcePath} -> ${destPath}`);

          } catch (error) {
            console.error(`Failed to copy ${sourcePath}:`, error);
            errorCount++;
          }
        }

        // Show final status
        if (successCount > 0 && errorCount === 0) {
          vscode.window.showInformationMessage(`✅ Successfully sent ${successCount} item(s) to: ${treeDataProvider.sendingDir}`);
        } else if (successCount > 0 && errorCount > 0) {
          vscode.window.showWarningMessage(`⚠️ Partially completed: ${successCount} item(s) sent, ${errorCount} failed. Check output for details.`);
        } else {
          vscode.window.showErrorMessage(`❌ Failed to send any items. Check console for details.`);
        }

      } catch (error) {
        console.error('Send files operation failed:', error);
        vscode.window.showErrorMessage(`Send files failed: ${error.message}`);
      }
    })
  );
}
exports.activate = activate;

// Helper function to count items in directory recursively
function countItemsInDirectory(dirPath) {
  try {
    let count = 0;
    const items = require('fs').readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      count++; // Count this item
      if (item.isDirectory()) {
        // Recursively count items in subdirectory
        count += countItemsInDirectory(require('path').join(dirPath, item.name));
      }
    }

    return count;
  } catch (error) {
    return 0;
  }
}

function deactivate() {}
exports.deactivate = deactivate;

// Helper function to copy files and directories recursively
function copyItemRecursive(source, destination) {
  const fs = require('fs');
  const path = require('path');

  try {
    const stats = fs.statSync(source);

    if (stats.isDirectory()) {
      // Create destination directory if it doesn't exist
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
        console.log(`Created directory: ${destination}`);
      }

      // Copy all contents of the directory
      const entries = fs.readdirSync(source);
      console.log(`Copying ${entries.length} items from directory: ${source}`);

      for (const entry of entries) {
        const srcPath = path.join(source, entry);
        const destPath = path.join(destination, entry);
        console.log(`Copying: ${srcPath} -> ${destPath}`);
        copyItemRecursive(srcPath, destPath);
      }
    } else {
      // Copy file, allowing overwrite
      const fileContent = fs.readFileSync(source);
      fs.writeFileSync(destination, fileContent);
      console.log(`File copied successfully: ${source} -> ${destination}`);

      // Verify the copy
      const destStats = fs.statSync(destination);
      if (destStats.size !== stats.size) {
        throw new Error(`File size mismatch: source ${stats.size} bytes, destination ${destStats.size} bytes`);
      }
    }
  } catch (error) {
    console.error(`Error copying ${source} to ${destination}:`, error);
    throw error;
  }
}
