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
        this.name = '📦 Packing Folder Name';
        this.currentValue = currentValue || 'Backup';
        this.tooltip = 'Click to edit the name of the folder for packed backups';
    }

    getTreeItem() {
        const item = new vscode.TreeItem(this.name, vscode.TreeItemCollapsibleState.None);
        item.description = this.currentValue;
        item.contextValue = 'setting';
        item.tooltip = this.tooltip;
        item.command = {
            command: 'backup-vault.editFolderName',
            title: 'Edit Packing Folder Name'
        };
        return item;
    }

    getChildren() {
        return [];
    }
}

class SelectionIndicator {
    constructor(selectedItems, deselectedItems) {
        this.selectedItems = selectedItems;
        this.deselectedItems = deselectedItems;
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

        // Count all directly selected items and their contents, minus deselected items
        for (const itemPath of this.selectedItems) {
            try {
                const stats = fs.statSync(itemPath);
                if (stats.isDirectory()) {
                    directFolders++;
                    // Count selected items in this directory (accounting for deselected items)
                    totalItems += this.countSelectedItemsInDirectory(itemPath);
                } else {
                    // Only count files that aren't deselected
                    if (!this.deselectedItems.has(itemPath)) {
                        directFiles++;
                        totalItems++;
                    }
                }
            } catch (error) {
                // Skip invalid paths
                continue;
            }
        }

        return `${directFolders} folders, ${directFiles} files (${totalItems} total)`;
    }

    countSelectedItemsInDirectory(dirPath) {
        try {
            let count = 0;
            const items = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const item of items) {
                const itemPath = path.join(dirPath, item.name);
                // Only count items that are not in deselectedItems
                if (!this.deselectedItems.has(itemPath)) {
                    count++; // Count this item
                    if (item.isDirectory()) {
                        // Recursively count selected items in subdirectory
                        count += this.countSelectedItemsInDirectory(itemPath);
                    }
                }
            }

            return count;
        } catch (error) {
            return 0;
        }
    }

    countItemsInDirectory(dirPath) {
        try {
            let count = 0;
            const items = fs.readdirSync(dirPath, { withFileTypes: true });

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
        this.deselectedItems = new Set(); // Track items explicitly deselected from parent selections

        // Load saved settings
        this.loadSettings();
        this.initializeWorkspace();
    }

    loadSettings() {
        console.log('Loading backup settings from workspace state...');
        const settings = this.context.workspaceState.get('backupSettings', {
            sources: [],
            deselectedSources: [],
            outputDir: '',
            sendingDir: '',
            packFiles: false,
            folderName: '',
            suffix: 'v'
        });

        console.log('Raw settings loaded:', settings);

        // Filter out invalid paths only (don't filter out root - it can be selected)
        const workspaceRootPath = this.workspaceRoot ? this.workspaceRoot.fullPath : null;
        let validSources = settings.sources.filter(path => {
            // Exclude non-existent paths only
            try {
                return fs.existsSync(path);
            } catch {
                return false;
            }
        });

        // Remove parent-child conflicts (root vs children, but allow root)
        validSources = this.removeParentChildConflicts(validSources, workspaceRootPath);

        console.log('Final valid sources after filtering and conflict resolution:', validSources);
        this.selectedItems = new Set(validSources);

        // Load deselected items, filtering out invalid paths
        let validDeselected = (settings.deselectedSources || []).filter(path => {
            try {
                return fs.existsSync(path);
            } catch {
                return false;
            }
        });
        this.deselectedItems = new Set(validDeselected);

        // Load other settings
        this.outputDir = settings.outputDir;
        this.sendingDir = settings.sendingDir;
        this.packFiles = settings.packFiles;
        this.folderName = settings.folderName;
        this.suffix = settings.suffix;

        console.log('Settings loaded - selectedItems:', Array.from(this.selectedItems), 'deselectedItems:', Array.from(this.deselectedItems));
    }

    saveSettings() {
        // Filter out invalid paths only (allow root to be saved)
        let filteredSources = Array.from(this.selectedItems).filter(path => {
            // Exclude non-existent paths only
            try {
                return fs.existsSync(path);
            } catch {
                return false;
            }
        });

        // Remove parent-child conflicts (allow root, but not root + children)
        const workspaceRootPath = this.workspaceRoot ? this.workspaceRoot.fullPath : null;
        filteredSources = this.removeParentChildConflicts(filteredSources, workspaceRootPath);

        // Filter deselected items to only include valid paths
        let filteredDeselected = Array.from(this.deselectedItems).filter(path => {
            try {
                return fs.existsSync(path);
            } catch {
                return false;
            }
        });

        const settings = {
            sources: filteredSources,
            deselectedSources: filteredDeselected,
            outputDir: this.outputDir,
            sendingDir: this.sendingDir,
            packFiles: this.packFiles,
            folderName: this.folderName,
            suffix: this.suffix
        };
        console.log('Saving settings with sources:', settings.sources, 'deselectedSources:', settings.deselectedSources);
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
            return [new SelectionIndicator(this.selectedItems, this.deselectedItems), new SettingsItem()]; // Still show settings even without workspace
        }

        if (!element) {
            // Root level - return selection indicator, settings item and workspace root
            return [new SelectionIndicator(this.selectedItems, this.deselectedItems), new SettingsItem(), this.workspaceRoot];
        }

        return element.getChildren();
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    toggleSelection(item) {
        console.log('toggleSelection called with item:', item.name, 'path:', item.fullPath, 'isRoot:', item.isRoot);
        console.log('selectedItems before toggle:', Array.from(this.selectedItems));
        console.log('deselectedItems:', Array.from(this.deselectedItems));

        const wasSelected = this.isItemSelected(item);
        console.log('Item was selected (accounting for deselectedItems):', wasSelected);

        if (wasSelected) {
            console.log('Deselecting item');
            // Deselecting - unified logic for both files and directories
            this.deselectItem(item);
        } else {
            console.log('Selecting item');
            // Selecting
            if (item.isDirectory) {
                this.selectFolder(item);
            } else {
                this.selectFile(item);
            }

            // For root selection, auto-enable packing since we're backing up the entire workspace
            if (item.isRoot && !this.packFiles) {
                console.log('Root selected - auto-enabling packFiles');
                this.packFiles = true;
            }
        }

        console.log('selectedItems after toggle:', Array.from(this.selectedItems));

        // Auto-enable packing if multiple items are now selected
        if (this.selectedItems.size > 1 && !this.packFiles) {
            console.log('Multiple items selected - auto-enabling packFiles');
            this.packFiles = true;
        }

        this.saveSettings();
        // Comprehensive tree refresh to ensure all UI elements update correctly
        this._onDidChangeTreeData.fire(); // Full tree refresh
        this._onDidChangeTreeData.fire(undefined); // Force complete rebuild
        // Refresh all ancestors to ensure checkmarks update for nested folders
        this.refreshAncestors(item);
        this._onDidChangeTreeData.fire(item);
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

    // Check if an item is selected (either directly or through parent, but not explicitly deselected)
    isItemSelected(item) {
        // Check if this item is directly selected
        if (this.selectedItems.has(item.fullPath)) {
            return true;
        }

        // Check if any parent is selected and this item hasn't been explicitly deselected
        if (this.isParentSelected(item) && !this.deselectedItems.has(item.fullPath)) {
            return true;
        }

        return false;
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

    // Remove parent-child conflicts (allow root, but not root + children)
    removeParentChildConflicts(paths, workspaceRootPath) {
        if (paths.length <= 1) return paths;

        // Check if root is selected along with children
        const hasRoot = workspaceRootPath && paths.includes(workspaceRootPath);
        if (hasRoot) {
            // If root is selected, remove all children of root
            const rootChildren = paths.filter(p =>
                p.startsWith(workspaceRootPath + '\\') ||
                p.startsWith(workspaceRootPath + '/')
            );
            return [workspaceRootPath]; // Only keep root
        }

        // Otherwise, use normal parent-child deduplication
        return this.removeParentChildDuplicates(paths);
    }

    // Check if any children of the given item are selected
    hasSelectedChildren(item) {
        const itemPath = item.fullPath;
        const sep1 = path.sep;
        const sep2 = sep1 === '\\' ? '/' : '\\';

        for (const selectedPath of this.selectedItems) {
            if (selectedPath.startsWith(itemPath + sep1) || selectedPath.startsWith(itemPath + sep2)) {
                return true;
            }
        }
        return false;
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

    // New helper methods for improved selection logic

    selectFolder(folder) {
        console.log('selectFolder called for:', folder.name);

        // Remove from deselected items if it was there (fixes issue with re-selecting deselected child folders)
        this.deselectedItems.delete(folder.fullPath);

        // Check if already selected through parent - if so, don't add to selectedItems
        if (this.isParentSelected(folder)) {
            console.log('Folder already selected through parent, skipping direct selection');
            // Still need to clear deselected items within this folder
            this.clearDeselectedItemsInFolder(folder);
            return;
        }

        // Remove any individually selected children
        this.removeChildSelections(folder);
        // Clear any deselected items within this folder
        this.clearDeselectedItemsInFolder(folder);
        // Add the folder itself
        this.selectedItems.add(folder.fullPath);
        console.log('Added folder to selectedItems:', folder.fullPath);
    }

    selectFile(file) {
        console.log('selectFile called for:', file.name);
        // Remove from deselected items if it was there
        this.deselectedItems.delete(file.fullPath);
        // Check if already selected through parent
        if (this.isParentSelected(file)) {
            console.log('File already selected through parent, skipping');
            return;
        }
        // Add the file
        this.selectedItems.add(file.fullPath);
        console.log('Added file to selectedItems:', file.fullPath);
        // Check if all siblings are now selected
        this.checkAndSelectParentIfAllSiblingsSelected(file);
    }

    deselectItem(item) {
        console.log('deselectItem called for:', item.name, 'isDirectory:', item.isDirectory);
        const wasDirectlySelected = this.selectedItems.has(item.fullPath);

        if (!wasDirectlySelected) {
            // Item appears selected only through parent - add to deselected items
            // Parent stays selected, but this specific item and all its children are now excluded
            console.log('Item deselected from parent selection, adding to deselectedItems');
            if (item.isDirectory) {
                this.addDeselectedItemsInFolder(item);
            } else {
                this.deselectedItems.add(item.fullPath);
            }

            // Check if this was the last selected child - if so, deselect the parent
            if (item.parent && this.selectedItems.has(item.parent.fullPath)) {
                this.checkAndDeselectParentIfNoChildrenSelected(item.parent);
            }
        } else {
            // Item was directly selected - remove it
            this.selectedItems.delete(item.fullPath);
            console.log('Removed item from selectedItems:', item.fullPath);

            // If this is a folder, clear deselected items in its subtree
            if (item.isDirectory) {
                this.clearDeselectedItemsInFolder(item);
            }
        }
    }



    checkAndSelectParentIfAllSiblingsSelected(file) {
        console.log('checkAndSelectParentIfAllSiblingsSelected called for:', file.name);
        if (!file.parent) {
            console.log('No parent, returning');
            return;
        }

        // Ensure parent children are loaded
        this.ensureChildrenLoaded(file.parent);

        const siblings = this.getAllSiblings(file);
        console.log('Siblings found:', siblings.length);
        const allSiblingsSelected = siblings.every(sibling => this.selectedItems.has(sibling.fullPath));
        console.log('All siblings selected:', allSiblingsSelected);

        if (allSiblingsSelected && siblings.length > 0) {
            console.log('Selecting parent folder');
            this.selectFolder(file.parent);
        }
    }

    getAllSiblings(item) {
        if (!item.parent) return [];
        // Ensure parent children are loaded
        this.ensureChildrenLoaded(item.parent);
        return item.parent.children.filter(child => child !== item);
    }

    ensureChildrenLoaded(parent) {
        if (parent.children.length === 0) {
            parent.getChildren(); // This will populate parent.children
        }
    }

    clearDeselectedItemsInFolder(folder) {
        const folderPath = folder.fullPath;
        const sep1 = path.sep;
        const sep2 = sep1 === '\\' ? '/' : '\\';

        // Remove any deselected items that are children of this folder (string-based approach)
        for (const deselectedPath of [...this.deselectedItems]) {
            if (deselectedPath.startsWith(folderPath + sep1) || deselectedPath.startsWith(folderPath + sep2)) {
                this.deselectedItems.delete(deselectedPath);
            }
        }

        // Also clear from loaded children (for completeness and to ensure tree items update)
        if (folder.children.length > 0) {
            for (const child of folder.children) {
                this.deselectedItems.delete(child.fullPath);
                if (child.isDirectory) {
                    this.clearDeselectedItemsInFolder(child);
                }
            }
        }
    }

    addDeselectedItemsInFolder(folder) {
        const folderPath = folder.fullPath;

        // Add the folder itself
        this.deselectedItems.add(folderPath);

        // Recursively scan filesystem to add all children (not just loaded ones)
        try {
            const items = fs.readdirSync(folderPath, { withFileTypes: true });
            for (const item of items) {
                const itemPath = path.join(folderPath, item.name);
                this.deselectedItems.add(itemPath);
                if (item.isDirectory()) {
                    // Recursively add subdirectory contents
                    this.addDeselectedItemsInFolderRecursive(itemPath);
                }
            }
        } catch (error) {
            // Skip directories that can't be read
            console.warn('Could not read directory for deselection:', folderPath, error);
        }
    }

    addDeselectedItemsInFolderRecursive(folderPath) {
        // Helper method for recursive filesystem scanning
        try {
            const items = fs.readdirSync(folderPath, { withFileTypes: true });
            for (const item of items) {
                const itemPath = path.join(folderPath, item.name);
                this.deselectedItems.add(itemPath);
                if (item.isDirectory()) {
                    this.addDeselectedItemsInFolderRecursive(itemPath);
                }
            }
        } catch (error) {
            // Skip directories that can't be read
            console.warn('Could not read subdirectory for deselection:', folderPath, error);
        }
    }

    checkAndDeselectParentIfNoChildrenSelected(parent) {
        console.log('checkAndDeselectParentIfNoChildrenSelected called for:', parent.name);
        // Ensure parent children are loaded
        this.ensureChildrenLoaded(parent);

        // Check if any children are still selected (not deselected)
        const hasSelectedChildren = parent.children.some(child => this.isItemSelected(child));
        console.log('Parent has selected children:', hasSelectedChildren);

        if (!hasSelectedChildren) {
            console.log('No children selected, deselecting parent');
            this.selectedItems.delete(parent.fullPath);
            // Clear deselected items for this parent since we're deselecting it
            this.clearDeselectedItemsInFolder(parent);
        }
    }

    refreshAncestors(item) {
        let current = item.parent;
        while (current) {
            this._onDidChangeTreeData.fire(current);
            current = current.parent;
        }
    }
}

module.exports = BackupTreeDataProvider;
