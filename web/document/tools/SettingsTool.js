'use strict';

var Tool = require('substance/ui/Tool');

function SettingsTool () {

  SettingsTool.super.apply(this, arguments);

}

SettingsTool.Prototype = function () {

  this.getTitle = function () {

    return 'Change settings for this document; not yet implemented :(';

  };

};

Tool.extend(SettingsTool);

module.exports = SettingsTool;

