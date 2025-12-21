const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

class SettingsItem {
    constructor() {
        this.name = '⚙️ Backup Settings';
        this.tooltip = 'Configure backup options (output directory, packing, suffix)';
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }

    getTreeItem() {
        const item = new vscode.TreeItem(this.name, this.collapsibleState);
        item.contextValue = 'settings';
        item.tooltip = this.tooltip;
        // Use direct blue color for settings header
        item.color = '#3794FF';
        return item;
    }

    getChildren() {
        const provider = this.getProvider();
        if (!provider) return [];

        return [
            new OutputDirSetting(provider.outputDir),
            new SendingDirSetting(provider.sendingDir),
            new SuffixSetting(provider.suffix),
            new PackSetting(provider.packFiles),
            new FolderNameSetting(provider.folderName)
        ];
    }

    getProvider() {
        return global.treeDataProvider;
    }
}

class OutputDirSetting {
    constructor(currentValue) {
        this.name = '📁 Output Directory';
        this.currentValue = currentValue || 'Not set';
        this.tooltip = 'Click to select backup output directory';
    }

    getTreeItem() {
        const item = new vscode.TreeItem(this.name, vscode.TreeItemCollapsibleState.None);
        item.description = this.currentValue;
        item.contextValue = 'setting';
        item.tooltip = this.tooltip;
        item.command = {
            command: 'backup-vault.editOutputDir',
            title: 'Edit Output Directory'
        };
        return item;
    }

    getChildren() {
        return [];
    }
}

class SendingDirSetting {
    constructor(currentValue) {
        this.name = '📤 Sending Directory';
        this.currentValue = currentValue || 'Not set';
        this.tooltip = 'Click to select directory to send files from';
    }

    getTreeItem() {
        const item = new vscode.TreeItem(this.name, vscode.TreeItemCollapsibleState.None);
        item.description = this.currentValue;
        item.contextValue = 'setting';
        item.tooltip = this.tooltip;
        item.command = {
            command: 'backup-vault.editSendingDir',
            title: 'Edit Sending Directory'
        };
        return item;
    }

    getChildren() {
        return [];
    }
}

class SelectionIndicator {
    constructor(selectedItems) {
        this.selectedItems = selectedItems;
        this.name = '📊 Selection Summary';
        this.tooltip = 'Shows count of selected folders, files, and total items';
    }

    getTreeItem() {
        const item = new vscode.TreeItem(this.name, vscode.TreeItemCollapsibleState.None);
        item.description = this.getSelectionCounts();
        item.contextValue = 'indicator';
        item.tooltip = this.tooltip;
        // Make it non-clickable by not setting a command
        return item;
    }

    getChildren() {
        return [];
    }

    getSelectionCounts() {
        if (!this.selectedItems || this.selectedItems.size === 0) {
            return 'None selected';
        }

        let directFolders = 0;
        let directFiles = 0;
        let totalItems = 0;

        for (const itemPath of this.selectedItems) {
            try {
                const stats = require('fs').statSync(itemPath);
                if (stats.isDirectory()) {
                    directFolders++;
                    // Count all items in this directory recursively
                    totalItems += this.countItemsInDirectory(itemPath);
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
    }

    countItemsInDirectory(dirPath) {
        try {
            let count = 0;
            const items = require('fs').readdirSync(dirPath, { withFileTypes: true });

            for (const item of items) {
                count++; // Count this item
                if (item.isDirectory()) {
                    // Recursively count items in subdirectory
                    count += this.countItemsInDirectory(path.join(dirPath, item.name));
                }
            }

            return count;
        } catch (error) {
            return 0;
        }
    }
}



class SuffixSetting {
    constructor(currentValue) {
        this.name = '🔖 Version Suffix';
        this.currentValue = currentValue || 'v';
        this.tooltip = 'Click to edit version suffix (e.g., v, _, ver)';
    }

    getTreeItem() {
        const item = new vscode.TreeItem(this.name, vscode.TreeItemCollapsibleState.None);
        item.description = this.currentValue;
        item.contextValue = 'setting';
        item.tooltip = this.tooltip;
        item.command = {
            command: 'backup-vault.editSuffix',
            title: 'Edit Version Suffix'
        };
        return item;
    }

    getChildren() {
        return [];
    }
}

class PackSetting {
    constructor(currentValue) {
        this.currentValue = currentValue;
    }

    getTreeItem() {
        const provider = this.getProvider();
        const multipleSelected = provider ? provider.selectedItems.size > 1 : false;

        const item = new vscode.TreeItem('📦 Pack Files', vscode.TreeItemCollapsibleState.None);

        if (multipleSelected) {
            // Multiple items selected - force packing and disable toggle
            item.description = 'Yes (Required)';
            item.tooltip = 'Multiple items selected - packing is required';
            // No command - makes it non-clickable
        } else {
            // Single item selected - allow toggle
            item.description = this.currentValue ? 'Yes' : 'No';
            item.tooltip = 'Click to toggle file packing option';
            item.command = {
                command: 'backup-vault.togglePack',
                title: 'Toggle File Packing'
            };
        }

        item.contextValue = 'setting';
        return item;
    }

    getProvider() {
        return global.treeDataProvider;
    }

    getChildren() {
        return [];
    }
}

class FolderNameSetting {
    constructor(currentValue) {
        this.name = '📂 Folder Name';
        this.currentValue = currentValue || 'Backup';
        this.tooltip = 'Click to edit folder name for packed backups';
    }

    getTreeItem() {
        const item = new vscode.TreeItem(this.name, vscode.TreeItemCollapsibleState.None);
        item.description = this.currentValue;
        item.contextValue = 'setting';
        item.tooltip = this.tooltip;
        item.command = {
            command: 'backup-vault.editFolderName',
            title: 'Edit Folder Name'
        };
        return item;
    }

    getChildren() {
        return [];
    }
}

class BackupItem {
    constructor(name, fullPath, isDirectory, parent = null, isRoot = false) {
        this.name = name;
        this.fullPath = fullPath;
        this.isDirectory = isDirectory;
        this.parent = parent;
        this.children = [];
        this.selected = false;
        this.isRoot = isRoot;
        this.collapsibleState = isDirectory ?
            vscode.TreeItemCollapsibleState.Collapsed :
            vscode.TreeItemCollapsibleState.None;
    }

    getTreeItem() {
        const item = new vscode.TreeItem(this.name, this.collapsibleState);
        item.resourceUri = vscode.Uri.file(this.fullPath);
        item.contextValue = this.isDirectory ? 'folder' : 'file';

        // Check if this item is selected (directly or through parent)
        const provider = this.getProvider();
        const isSelected = provider ? provider.isItemSelected(this) : false;

        // Set icon based on selection state
        if (this.isDirectory) {
            item.iconPath = {
                light: path.join(__filename, '..', 'resources', 'folder.svg'),
                dark: path.join(__filename, '..', 'resources', 'folder.svg')
            };
        }

        // Add checkbox state to description
        item.description = isSelected ? '✓' : '';

        // Add tooltip and command (only for non-root items)
        if (this.isRoot) {
            item.tooltip = `${this.name} - Expand to see workspace contents`;
        } else {
            item.tooltip = `${this.name} (${isSelected ? 'Selected' : 'Not selected'}) - Click to toggle selection`;

            // Make item clickable for selection
            item.command = {
                command: 'backup-vault.toggleSelection',
                title: 'Toggle Selection',
                arguments: [this]
            };
        }

        return item;
    }

    getProvider() {
        // Find the provider instance - this is a bit hacky but necessary
        // since VS Code doesn't pass the provider to getTreeItem
        return global.treeDataProvider;
    }

    getChildren() {
        if (!this.isDirectory) return [];

        try {
            const items = fs.readdirSync(this.fullPath, { withFileTypes: true })
                .map(dirent => new BackupItem(
                    dirent.name,
                    path.join(this.fullPath, dirent.name),
                    dirent.isDirectory(),
                    this
                ))
                .sort((a, b) => {
                    // Directories first, then alphabetically
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                });

            this.children = items;
            return items;
        } catch (error) {
            console.error('Error reading directory:', error);
            return [];
        }
    }
}

class BackupTreeDataProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.workspaceRoot = null;
        this.selectedItems = new Set();

        // Load saved settings
        this.loadSettings();
        this.initializeWorkspace();
    }

    loadSettings() {
        console.log('Loading backup settings from workspace state...');
        const settings = this.context.workspaceState.get('backupSettings', {
            sources: [],
            outputDir: '',
            sendingDir: '',
            packFiles: false,
            folderName: '',
            suffix: 'v'
        });

        console.log('Raw settings loaded:', settings);

        // Filter out workspace root and any invalid paths, but allow hidden directories
        const workspaceRootPath = this.workspaceRoot ? this.workspaceRoot.fullPath : null;
        let validSources = settings.sources.filter(path => {
            // Exclude workspace root
            if (workspaceRootPath && path === workspaceRootPath) {
                return false;
            }
            // Exclude non-existent paths only
            try {
                return require('fs').existsSync(path);
            } catch {
                return false;
            }
        });

        // Remove parent-child duplicates (if a parent is selected, remove all its children)
        validSources = this.removeParentChildDuplicates(validSources);

        console.log('Final valid sources after filtering and deduplication:', validSources);
        this.selectedItems = new Set(validSources);

        // Load other settings
        this.outputDir = settings.outputDir;
        this.sendingDir = settings.sendingDir;
        this.packFiles = settings.packFiles;
        this.folderName = settings.folderName;
        this.suffix = settings.suffix;

        console.log('Settings loaded - selectedItems:', Array.from(this.selectedItems));
    }

    saveSettings() {
        // Minimal filtering for save - preserve user selections but remove truly invalid ones
        const workspaceRootPath = this.workspaceRoot ? this.workspaceRoot.fullPath : null;
        let filteredSources = Array.from(this.selectedItems).filter(path => {
            // Exclude workspace root (safety check - shouldn't be selectable anyway)
            if (workspaceRootPath && path === workspaceRootPath) {
                return false;
            }
            // Exclude non-existent paths only
            try {
                return require('fs').existsSync(path);
            } catch {
                return false;
            }
        });

        // Remove parent-child duplicates (if a parent is selected, remove all its children)
        filteredSources = this.removeParentChildDuplicates(filteredSources);

        const settings = {
            sources: filteredSources,
            outputDir: this.outputDir,
            sendingDir: this.sendingDir,
            packFiles: this.packFiles,
            folderName: this.folderName,
            suffix: this.suffix
        };
        console.log('Saving settings with sources:', settings.sources);
        this.context.workspaceState.update('backupSettings', settings);
    }

    initializeWorkspace() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            this.workspaceRoot = new BackupItem(
                workspaceFolder.name,
                workspaceFolder.uri.fsPath,
                true,
                null,
                true // isRoot = true
            );
        }
    }

    getTreeItem(element) {
        return element.getTreeItem();
    }

    getChildren(element) {
        if (!this.workspaceRoot) {
            return [new SelectionIndicator(this.selectedItems), new SettingsItem()]; // Still show settings even without workspace
        }

        if (!element) {
            // Root level - return selection indicator, settings item and workspace root
            return [new SelectionIndicator(this.selectedItems), new SettingsItem(), this.workspaceRoot];
        }

        return element.getChildren();
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    toggleSelection(item) {
        console.log('toggleSelection called with item:', item.name, 'path:', item.fullPath);
        console.log('selectedItems before toggle:', Array.from(this.selectedItems));

        // Validate path exists
        if (!require('fs').existsSync(item.fullPath)) {
            vscode.window.showErrorMessage(`Path no longer exists: ${item.fullPath}`);
            return;
        }

        const path = item.fullPath;
        const wasSelected = this.selectedItems.has(path);
        console.log('Item was selected:', wasSelected);

        if (wasSelected) {
            console.log('Unselecting item');
            // Unselecting - remove this item and all its children
            this.unselectItemAndChildren(item);
        } else {
            console.log('Checking if parent is selected');
            // Check if parent is already selected
            if (this.isParentSelected(item)) {
                console.log('Parent is selected - cannot select child');
                vscode.window.showInformationMessage('Cannot select item - parent folder is already selected');
                return;
            }

            console.log('Selecting item - adding to selectedItems');
            // Selecting - add this item (but not its children to avoid duplication)
            this.selectedItems.add(item.fullPath);

            // Remove any children that might be individually selected
            this.removeChildSelections(item);
        }

        console.log('selectedItems after toggle:', Array.from(this.selectedItems));

        // Auto-enable packing if multiple items are now selected
        if (this.selectedItems.size > 1 && !this.packFiles) {
            console.log('Multiple items selected - auto-enabling packFiles');
            this.packFiles = true;
        }

        this.saveSettings();
        // Refresh entire tree so settings get re-evaluated
        this._onDidChangeTreeData.fire();
    }

    isParentSelected(item) {
        let current = item.parent;
        while (current) {
            if (this.selectedItems.has(current.fullPath)) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    removeChildSelections(item) {
        const itemPath = item.fullPath;
        const sep1 = path.sep;
        const sep2 = sep1 === '\\' ? '/' : '\\';

        // Remove any selected paths that are children of this item
        for (const selectedPath of [...this.selectedItems]) {  // copy to avoid modification during iteration
            if (selectedPath.startsWith(itemPath + sep1) || selectedPath.startsWith(itemPath + sep2)) {
                this.selectedItems.delete(selectedPath);
            }
        }

        // Also remove from loaded children (for completeness)
        if (item.children.length > 0) {
            for (const child of item.children) {
                this.selectedItems.delete(child.fullPath);
                this.removeChildSelections(child);
            }
        }
    }

    unselectItemAndChildren(item) {
        const itemPath = item.fullPath;
        const sep1 = path.sep;
        const sep2 = sep1 === '\\' ? '/' : '\\';

        // Remove the item itself
        this.selectedItems.delete(item.fullPath);

        // Remove any selected paths that are children of this item
        for (const selectedPath of [...this.selectedItems]) {  // copy to avoid modification during iteration
            if (selectedPath.startsWith(itemPath + sep1) || selectedPath.startsWith(itemPath + sep2)) {
                this.selectedItems.delete(selectedPath);
            }
        }

        // Also remove from loaded children (for completeness)
        if (item.children.length > 0) {
            for (const child of item.children) {
                this.unselectItemAndChildren(child);
            }
        }
    }

    // Check if an item is selected (either directly or through parent)
    isItemSelected(item) {
        // Check if this item is directly selected
        if (this.selectedItems.has(item.fullPath)) {
            return true;
        }

        // Check if any parent is selected
        return this.isParentSelected(item);
    }

    selectAllChildren(item) {
        if (item.children.length === 0) {
            item.getChildren(); // Load children if not loaded
        }
        for (const child of item.children) {
            this.selectedItems.add(child.fullPath);
            if (child.isDirectory) {
                this.selectAllChildren(child);
            }
        }
    }

    // Remove paths that are children of other selected paths
    removeParentChildDuplicates(paths) {
        if (paths.length <= 1) return paths;

        // Sort paths by length (parents first)
        const sortedPaths = paths.sort((a, b) => a.length - b.length);
        const result = [];

        for (const path of sortedPaths) {
            // Check if this path is a child of any already selected path
            const isChildOfSelected = result.some(selectedPath => {
                return path.startsWith(selectedPath + '\\') || path.startsWith(selectedPath + '/');
            });

            if (!isChildOfSelected) {
                result.push(path);
            }
        }

        return result;
    }
}

module.exports = BackupTreeDataProvider;
