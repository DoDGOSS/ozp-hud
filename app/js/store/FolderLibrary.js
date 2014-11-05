'use strict';

var Reflux = require('reflux');
var Immutable = require('immutable');
var LibraryStore = require('./Library');
var LibraryActions = require('../actions/Library');

var Folder = require('../api/Folder');

/**
 * @return a new entry that is just like the old one but with
 * its folder set to the old foldername
 */
function updateFolderName(newFolder, entry) {
    var newEntry = Object.create(null, entry);
    newEntry.folder = name;

    return Object.freeze(newEntry);
}

/**
 * Get the name of the folder containing item.  NOTE: If item is a folder itself,
 * this will be the name of the folder containing that folder (currently always null), not the
 * name of the folder itself
 */
function getFolderName(item) {
    if (item instanceof Folder) {
        return null;
    }
    else {
        return item.folder;
    }
}

/**
 * @return the object upon which the position of item is based.  For normal entries, this is the
 * item itself.  For folders, it is the first entry in the folder
 */
function getIndexableItem(item) {
    if (item instanceof Folder) {
        return item.entries[0];
    }
    else {
        return item;
    }
}

/**
 * This store provides a view in front of LibraryStore which
 * organizes the entries into folders.  It contains the logic for implementing various
 * high-level reordering and foldering actions
 */
var FolderLibraryStore = Reflux.createStore({
    //reference to the data from the LibraryStore
    flatLibrary: null,

    folderedEntries: null,

    init: function() {
        this.flatLibrary = Immutable.List();
        this.folderedEntries = Immutable.List();

        this.listenTo(LibraryStore, this.onBackingStoreChange);
        this.listenToMany(LibraryActions);
    },

    onBackingStoreChange: function(entries) {

        //a list where each element is either an entry or a folder of entries
        var folderedEntries = entries.reduce(function(acc, ent) {
            if (!ent.folder) {
                return acc.push(ent);
            }
            else {
                var existingFolder = acc.find(function(el) {
                    return el instanceof Folder && el.name === ent.folder;
                });

                if (existingFolder) {
                    var folderIndex = acc.indexOf(existingFolder);
                    return acc.splice(folderIndex, 1, new Folder(existingFolder, ent));
                }
                else {
                    return acc.push(new Folder(null, ent));
                }
            }
        }, Immutable.List());

        this.flatLibrary = entries;
        this.folderedEntries = folderedEntries;

        this.trigger(folderedEntries);
    },

    onReorder: function(newBefore, toMove, newAfter) {
        if (!(newBefore || newAfter)) {
            throw new Error('Trying to reorder without specifying either adjacency');
        }

        if ((newBefore && getFolderName(newBefore) !== getFolderName(toMove)) ||
                    (newAfter && getFolderName(newAfter) !== getFolderName(toMove))) {
            throw new Error('Attempting to reorder of items that are not ' +
                    'in the same folder');
        }

        var currentIndex = this.flatLibrary.indexOf(getIndexableItem(toMove)),
            targetIndex = newBefore ?
                this.flatLibrary.indexOf(getIndexableItem(newBefore)) + 1 :
                this.flatLibrary.indexOf(getIndexableItem(newAfter)),
            destIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;

        var data = this.flatLibrary
            //remove the entry at its old location
            .splice(currentIndex, 1)
            //add the entry at the new location
            .splice(destIndex, 0, toMove);

        LibraryActions.updateLibrary(data);
    },

    onCreateFolder: function(name, entries) {
        if (entries.find(function(entry) { return !!entry.folder; })) {
            throw new Error(
                'Trying to create folder with an entry that is already in a folder');
        }

        //this index at which the folder will be inserted
        var data,
            folderIndex = this.flatLibrary.indexOf(entries[0]),
            newEntries = entries.map(updateFolderName.bind(null, name));

        data = this.flatLibrary
            //add folder
            .splice(folderIndex, 0, newEntries)
            //remove old, unfoldered entries
            .filter(Array.prototype.contains.bind(entries));

        LibraryActions.updateLibrary(data);
    },

    onUnFolder: function(name) {
        function findFolderEntry(entry) {
            return entry.folder === name;
        }

        var folderIndex = this.flatLibrary.findIndex(findFolderEntry),
            folderedEntries = this.flatLibrary.filter(findFolderEntry),
            newEntries = folderedEntries.map(updateFolderName.bind(null, null)),
            data = this.flatLibrary
                .splice(folderIndex, 0, newEntries)
                .filter(Array.prototype.contains.bind(folderedEntries));

        LibraryActions.updateLibrary(data);
    },

    getDefaultData: function() {
        return this.folderedEntries;
    }
});

module.exports = FolderLibraryStore;
