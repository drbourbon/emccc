(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const p = require("@tonaljs/pcset")
const c = require("@tonaljs/chord")
const m = require("@tonaljs/midi")
const WebMidi = require("webmidi");

var device = null;
var emc_channel = 0;
var last_emc_note = 0;

function sendShapeColor(note, shape, color, velocity, channel) {
//    console.log(`Sending Note:${note}, Shape:${shape}, Color:${color}, Velocity:${velocity} on Channel ${channel}`);
    last_emc_note = note;
    device.sendControlChange(17,shape,channel)
        .sendControlChange(16,color, channel)
        .playNote(note, channel, { velocity:velocity });
//    device.playNote(note, channel).sendControlChange(17,shape).sendControlChange(16,color);
}

function sendOff(channel) {
    if(last_emc_note){
        const n = current_notes.filter(Boolean).length ;
        if(n==0)
            device.stopNote(last_emc_note, channel)
    }
}

function enableWebMidi() {
    WebMidi.enable(function (err) {
        if (err) {
            console.log('Browser not compatible');
            $('#not_compatible_message').show();
            $('#device_status').css('color', 'red');
            $('#connection-info').hide();
            $('.device-connected').hide();
            $('.unsupported').show();

            return;
        }

        $('.unsupported').hide();
        
        WebMidi.addListener('connected', function (event) {
            handleConnection(event, true);
        });
        WebMidi.addListener('disconnected', function (event) {
            handleConnection(event, false);
        });
        onDisconnect();
        disconnectInputs();
    }, sysex=false);    
}

function isModelCycles(s){
    return s.name == 'Elektron Model:Cycles'
}

function connectInputs() {
    var input = null;
    var keysconnected = false;
    for (var i = 0; i < WebMidi.inputs.length; i++) {
//        console.log('Input', WebMidi.inputs[i].name, WebMidi.outputs[i]);
        if (!isModelCycles(WebMidi.outputs[i])) {
            keysconnected = true;
            input = WebMidi.inputs[i];
            input.removeListener();
            input.addListener('noteon', "all", function (event) {
                //console.log(event.note);
                current_notes[event.note.number] = true;
                current_notes_velocity[event.note.number] = event.velocity;
                playedChord(true);
            })
            input.addListener('noteoff', "all", function (event) {
                //console.log(event.note);
                current_notes[event.note.number] = false;
                current_notes_velocity[event.note.number] = 0;
                playedChord(false);
                if(emc_channel)
                    sendOff(emc_channel);
            })            
        }
    }

    if(keysconnected){
        $('.keys-connected').show();
        $('.keys-disconnected').hide();
    } else {
        $('.keys-connected').hide();
        $('.keys-disconnected').show();
    }

}

function disconnectInputs() {
    $('.keys-connected').hide();
    $('.keys-disconnected').show();
}

function handleConnection(event, state) {
//    console.log("MIDI connection event: " + state + ". Payload[" + JSON.stringify(event) + "]");

    if(state==true){
        if(isModelCycles(event.port)){
            device = event.port;
            onConnect();
        } else {
            connectInputs();
        }
    } else {
        if(isModelCycles(event.port)){
            onDisconnect();
        } else {
            disconnectInputs();
        }
    }
    /*
    if(state===true){
        device = WebMidi.outputs[i];

        for (var i = 0; i < WebMidi.outputs.length; i++) {
//            console.log('Output', WebMidi.outputs[i].name, WebMidi.outputs[i]);
    
            if (isModelCycles(WebMidi.outputs[i])) {
                device = WebMidi.outputs[i];
                break;
            }
        }

        if(device)
            onConnect();
        else
            onDisconnect();

        connectInputs()
        
    } else {
        onDisconnect();
    }
    */
}


var current_notes = new Array(127).fill(false);
var current_notes_velocity = new Array(127).fill(0);
var connection_complete = false
function onConnect() {
    $('#unconnected_message').hide();
    $('#device_status').css('color', 'green');
    $('#connection-info').show();
    
    $('.device-connected').show();
    $('.device-disconnected').hide();

    $('.device-enabled').removeClass('disabled');
    $('.device-disabled').addClass('disabled');
    
    connection_complete = true;
    console.log('Connection established');
}

function onDisconnect() {
    device = null;

    // app level 
    $('#unconnected_message').show();
    $('#device_status').css('color', 'orange');
    $('#connection-info').hide();

    $('.device-connected').hide();
    $('.device-disconnected').show();

    /*
    $('.keys-connected').hide();
    $('.keys-disconnected').show();
    */

    $('.device-enabled').addClass('disabled');
    $('.device-disabled').removeClass('disabled');

    $(document).trigger('dm:disconnected');
}

function soloNota(s) {
    if(s[1]=='b' || s[1]=='#') return s.substring(0,1);
    return s[0];
}

function soloTipo(s) {
    if(s[1]=='b' || s[1]=='#') return s.substring(2);
    return s.substring(1);
}

function playedChord(send) {
    const n = current_notes.filter(Boolean).length ;
    if(n>2){
        var chord = [];
        var velocity = 0;
        for(var i=0; i<current_notes.length; i++){
            if(current_notes[i]){
                if(velocity==0) velocity = current_notes_velocity[i];
                chord.push(m.midiToNoteName(i, { sharps: true }));
            }
        }
        //console.log(chord);
        const name = c.detect(chord);
        //console.log(name);
        if(name.length>0){
            const cname = soloTipo(name[0])=='m#5' && name.length>1 ? name[1] : name[0]; // TODO others

            // convert to base + rivolto
            const base = cname.split('/')[0];
            const baseSoloNota = soloNota(base);
            var rivolto;
            if(!cname.includes('/')){
                rivolto = 0;
            } else {
                switch(n){
                    case 3: rivolto = soloNota(chord[1])==baseSoloNota ? 2 : 1; break;
                    case 4: rivolto = soloNota(chord[1])==baseSoloNota ? 1 : 
                        soloNota(chord[2])==baseSoloNota ? 2 : 3; 
                        break
                    default: rivolto = 0; break;
                }
            }

            // convert chord to EMC engine shape
            if(send){
                const chordType = soloTipo(base);
                const shape = shapeMap[chordType];
                const color = rivolto==0 ? 32 : (rivolto==1 ? 62 : (rivolto = 2 ? 74 : 84));
                var tonica = soloNota(chord[0])==baseSoloNota ? chord[0] : 
                    (soloNota(chord[1])==baseSoloNota ? chord[1] :
                        (soloNota(chord[2])==baseSoloNota ? chord[2] : chord[3]));
    
                const tonicaCode = m.toMidi(tonica);

                tonica = tonica.slice(0,-1) + "-" + (parseInt(tonica.slice(-1))+1) // trick

                if(emc_channel && shape && color && tonicaCode){
                    sendShapeColor(tonicaCode, shape-1, color-1, velocity, emc_channel);
                    $(document).trigger('emccc:chord',[ cname, {
                        "chord":cname,
                        "shape":shape,
                        "color":color,
                        "tonica":tonica,
                        "notes":chord
                    } ]);
                    return;
                }
            }

            //$(document).trigger('emccc:chord',[ cname, { "chord":cname, "notes":chord } ]);
            return;
        }
    } else if (false /*n==1*/) {
        var note = 0;
        for(var i=0; i<current_notes.length; i++){
            if(current_notes[i]){
                note = m.midiToNoteName(i, { sharps: true });
                break;
            }
        }
        const cname = soloNota(note);

        if(send){
            const shape = 1;
            const color = 1; // detune
            var tonica = note;
            const tonicaCode = m.toMidi(tonica);
    
            tonica = tonica.slice(0,-1) + "-" + (parseInt(tonica.slice(-1))+1) // trick
    
            if(emc_channel){
                sendShapeColor(tonicaCode, shape-1, color-1, velocity, emc_channel);
                /*
                $(document).trigger('emccc:chord',[ cname, {
                    "chord":cname,
                    "shape":shape,
                    "color":color,
                    "tonica":tonica,
                    "notes":chord
                } ]);
                */
                return;
            }
        }
        //(document).trigger('emccc:chord',[ cname, { "chord":cname, "notes":[ note ] } ]);
        return;
    }
    $(document).trigger('emccc:chord'); // undef chord
}

//console.log(detect);

//exports.detect = detect

const shapeMap = {
  "m":4,
  "M":5,
  "sus2":6,
  "sus4":7,
  "m7":8,
  "7":9,
  "maj7":11,
  "7sus4":12,
  "dim7":13,
  "madd9":14,
  "Madd9":15,
  "m6":16,
  "6":17,
  "dim":18,
  "Mb5":19,
  "m7b5":20,
  "M7b5":21,
  "Mb6":22,
  "m7#5":23,
  "7b13":24,
  "9no5":27
}

/*
    ["minor", 4],
    ["Major", 5],
    ["sus2", 6],
    ["sus4", 7]

    • Major 
    • sus2 
    • sus4 
    • m7
    • M7
• mMaj7 
    • Maj7
    • 7sus4 
    • dim7
    • madd9 
    • Madd9 
    • m6
    • M6
    • mb5
    • Mb5
    • m7b5
    • M7b5 
    • M#5
    • m7#5
    • M7#5 
• mb6
• m9no5 // not recognized
• M9no5
• Madd9b5
• Maj7b5
• M7b9no5
• sus4#5b9
• sus4add#5 • Maddb5
• M6add4no5 • Maj7/6no5
• Maj9no5
• Fourths
• Fifths
*/

if (typeof window !== 'undefined') {
    window.SetEMCChannel = function(s) {
        emc_channel = s;
    }
    window.midi = function(s) {
        return m.midiToNoteName(s);
    }
    window.enableWebMidi = function() {
        return enableWebMidi();
    }
}

},{"@tonaljs/chord":4,"@tonaljs/midi":7,"@tonaljs/pcset":8,"webmidi":10}],2:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/chord-type'), require('@tonaljs/core'), require('@tonaljs/pcset')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/chord-type', '@tonaljs/core', '@tonaljs/pcset'], factory) :
  (global = global || self, factory(global.ChordDetect = {}, global.chordType, global.core, global.pcset));
}(this, (function (exports, chordType, core, pcset) { 'use strict';

  var NotFound = { weight: 0, name: "" };
  var namedSet = function (notes) {
      var pcToName = notes.reduce(function (record, n) {
          var chroma = core.note(n).chroma;
          if (chroma !== undefined) {
              record[chroma] = record[chroma] || core.note(n).name;
          }
          return record;
      }, {});
      return function (chroma) { return pcToName[chroma]; };
  };
  function detect(source) {
      var notes = source.map(function (n) { return core.note(n).pc; }).filter(function (x) { return x; });
      if (core.note.length === 0) {
          return [];
      }
      var found = findExactMatches(notes, 1);
      return found
          .filter(function (chord) { return chord.weight; })
          .sort(function (a, b) { return b.weight - a.weight; })
          .map(function (chord) { return chord.name; });
  }
  function findExactMatches(notes, weight) {
      var tonic = notes[0];
      var tonicChroma = core.note(tonic).chroma;
      var noteName = namedSet(notes);
      var allModes = pcset.modes(notes, false);
      var found = allModes.map(function (mode, chroma) {
          var chordName = chordType.get(mode).aliases[0];
          if (!chordName) {
              return NotFound;
          }
          var baseNote = noteName(chroma);
          var isInversion = chroma !== tonicChroma;
          if (isInversion) {
              return { weight: 0.5 * weight, name: "" + baseNote + chordName + "/" + tonic };
          }
          else {
              return { weight: 1 * weight, name: "" + baseNote + chordName };
          }
      });
      return found;
  }
  var index = { detect: detect };

  exports.default = index;
  exports.detect = detect;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/chord-type":3,"@tonaljs/core":6,"@tonaljs/pcset":8}],3:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core'), require('@tonaljs/pcset')) :
    typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core', '@tonaljs/pcset'], factory) :
    (global = global || self, factory(global.ChordType = {}, global.core, global.pcset));
}(this, (function (exports, core, pcset) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    /**
     * @private
     * Chord List
     * Source: https://en.wikibooks.org/wiki/Music_Theory/Complete_List_of_Chord_Patterns
     * Format: ["intervals", "full name", "abrv1 abrv2"]
     */
    var CHORDS = [
        // ==Major==
        ["1P 3M 5P", "major", "M "],
        ["1P 3M 5P 7M", "major seventh", "maj7 Δ ma7 M7 Maj7"],
        ["1P 3M 5P 7M 9M", "major ninth", "maj9 Δ9"],
        ["1P 3M 5P 7M 9M 13M", "major thirteenth", "maj13 Maj13"],
        ["1P 3M 5P 6M", "sixth", "6 add6 add13 M6"],
        ["1P 3M 5P 6M 9M", "sixth/ninth", "6/9 69"],
        ["1P 3M 5P 7M 11A", "lydian", "maj#4 Δ#4 Δ#11"],
        ["1P 3M 6m 7M", "major seventh b6", "M7b6"],
        // ==Minor==
        // '''Normal'''
        ["1P 3m 5P", "minor", "m min -"],
        ["1P 3m 5P 7m", "minor seventh", "m7 min7 mi7 -7"],
        ["1P 3m 5P 7M", "minor/major seventh", "m/ma7 m/maj7 mM7 m/M7 -Δ7 mΔ"],
        ["1P 3m 5P 6M", "minor sixth", "m6"],
        ["1P 3m 5P 7m 9M", "minor ninth", "m9"],
        ["1P 3m 5P 7m 9M 11P", "minor eleventh", "m11"],
        ["1P 3m 5P 7m 9M 13M", "minor thirteenth", "m13"],
        // '''Diminished'''
        ["1P 3m 5d", "diminished", "dim ° o"],
        ["1P 3m 5d 7d", "diminished seventh", "dim7 °7 o7"],
        ["1P 3m 5d 7m", "half-diminished", "m7b5 ø"],
        // ==Dominant/Seventh==
        // '''Normal'''
        ["1P 3M 5P 7m", "dominant seventh", "7 dom"],
        ["1P 3M 5P 7m 9M", "dominant ninth", "9"],
        ["1P 3M 5P 7m 9M 13M", "dominant thirteenth", "13"],
        ["1P 3M 5P 7m 11A", "lydian dominant seventh", "7#11 7#4"],
        // '''Altered'''
        ["1P 3M 5P 7m 9m", "dominant b9", "7b9"],
        ["1P 3M 5P 7m 9A", "dominant #9", "7#9"],
        ["1P 3M 7m 9m", "altered", "alt7"],
        // '''Suspended'''
        ["1P 4P 5P", "suspended 4th", "sus4"],
        ["1P 2M 5P", "suspended 2nd", "sus2"],
        ["1P 4P 5P 7m", "suspended 4th seventh", "7sus4"],
        ["1P 5P 7m 9M 11P", "eleventh", "11"],
        ["1P 4P 5P 7m 9m", "suspended 4th b9", "b9sus phryg"],
        // ==Other==
        ["1P 5P", "fifth", "5"],
        ["1P 3M 5A", "augmented", "aug + +5"],
        ["1P 3M 5A 7M", "augmented seventh", "maj7#5 maj7+5"],
        ["1P 3M 5P 7M 9M 11A", "major #11 (lydian)", "maj9#11 Δ9#11"],
        // ==Legacy==
        ["1P 2M 4P 5P", "", "sus24 sus4add9"],
        ["1P 3M 13m", "", "Mb6"],
        ["1P 3M 5A 7M 9M", "", "maj9#5 Maj9#5"],
        ["1P 3M 5A 7m", "", "7#5 +7 7aug aug7"],
        ["1P 3M 5A 7m 9A", "", "7#5#9 7alt"],
        ["1P 3M 5A 7m 9M", "", "9#5 9+"],
        ["1P 3M 5A 7m 9M 11A", "", "9#5#11"],
        ["1P 3M 5A 7m 9m", "", "7#5b9"],
        ["1P 3M 5A 7m 9m 11A", "", "7#5b9#11"],
        ["1P 3M 5A 9A", "", "+add#9"],
        ["1P 3M 5A 9M", "", "M#5add9 +add9"],
        ["1P 3M 5P 6M 11A", "", "M6#11 M6b5 6#11 6b5"],
        ["1P 3M 5P 6M 7M 9M", "", "M7add13"],
        ["1P 3M 5P 6M 9M 11A", "", "69#11"],
        ["1P 3M 5P 6m 7m", "", "7b6"],
        ["1P 3M 5P 7M 9A 11A", "", "maj7#9#11"],
        ["1P 3M 5P 7M 9M 11A 13M", "", "M13#11 maj13#11 M13+4 M13#4"],
        ["1P 3M 5P 7M 9m", "", "M7b9"],
        ["1P 3M 5P 7m 11A 13m", "", "7#11b13 7b5b13"],
        ["1P 3M 5P 7m 13M", "", "7add6 67 7add13"],
        ["1P 3M 5P 7m 9A 11A", "", "7#9#11 7b5#9"],
        ["1P 3M 5P 7m 9A 11A 13M", "", "13#9#11"],
        ["1P 3M 5P 7m 9A 11A 13m", "", "7#9#11b13"],
        ["1P 3M 5P 7m 9A 13M", "", "13#9"],
        ["1P 3M 5P 7m 9A 13m", "", "7#9b13"],
        ["1P 3M 5P 7m 9M 11A", "", "9#11 9+4 9#4"],
        ["1P 3M 5P 7m 9M 11A 13M", "", "13#11 13+4 13#4"],
        ["1P 3M 5P 7m 9M 11A 13m", "", "9#11b13 9b5b13"],
        ["1P 3M 5P 7m 9m 11A", "", "7b9#11 7b5b9"],
        ["1P 3M 5P 7m 9m 11A 13M", "", "13b9#11"],
        ["1P 3M 5P 7m 9m 11A 13m", "", "7b9b13#11 7b9#11b13 7b5b9b13"],
        ["1P 3M 5P 7m 9m 13M", "", "13b9"],
        ["1P 3M 5P 7m 9m 13m", "", "7b9b13"],
        ["1P 3M 5P 7m 9m 9A", "", "7b9#9"],
        ["1P 3M 5P 9M", "", "Madd9 2 add9 add2"],
        ["1P 3M 5P 9m", "", "Maddb9"],
        ["1P 3M 5d", "", "Mb5"],
        ["1P 3M 5d 6M 7m 9M", "", "13b5"],
        ["1P 3M 5d 7M", "", "M7b5"],
        ["1P 3M 5d 7M 9M", "", "M9b5"],
        ["1P 3M 5d 7m", "", "7b5"],
        ["1P 3M 5d 7m 9M", "", "9b5"],
        ["1P 3M 7m", "", "7no5"],
        ["1P 3M 7m 13m", "", "7b13"],
        ["1P 3M 7m 9M", "", "9no5"],
        ["1P 3M 7m 9M 13M", "", "13no5"],
        ["1P 3M 7m 9M 13m", "", "9b13"],
        ["1P 3m 4P 5P", "", "madd4"],
        ["1P 3m 5A", "", "m#5 m+ mb6"],
        ["1P 3m 5P 6M 9M", "", "m69"],
        ["1P 3m 5P 6m 7M", "", "mMaj7b6"],
        ["1P 3m 5P 6m 7M 9M", "", "mMaj9b6"],
        ["1P 3m 5P 7M 9M", "", "mMaj9"],
        ["1P 3m 5P 7m 11P", "", "m7add11 m7add4"],
        ["1P 3m 5P 9M", "", "madd9"],
        ["1P 3m 5d 6M 7M", "", "o7M7"],
        ["1P 3m 5d 7M", "", "oM7"],
        ["1P 3m 6m 7M", "", "mb6M7"],
        ["1P 3m 6m 7m", "", "m7#5"],
        ["1P 3m 6m 7m 9M", "", "m9#5"],
        ["1P 3m 6m 7m 9M 11P", "", "m11A"],
        ["1P 3m 6m 9m", "", "mb6b9"],
        ["1P 3m 7m 12d 2M", "", "m9b5 h9"],
        ["1P 3m 7m 12d 2M 4P", "", "m11b5 h11"],
        ["1P 4P 5A 7M", "", "M7#5sus4"],
        ["1P 4P 5A 7M 9M", "", "M9#5sus4"],
        ["1P 4P 5A 7m", "", "7#5sus4"],
        ["1P 4P 5P 7M", "", "M7sus4"],
        ["1P 4P 5P 7M 9M", "", "M9sus4"],
        ["1P 4P 5P 7m 9M", "", "9sus4 9sus"],
        ["1P 4P 5P 7m 9M 13M", "", "13sus4 13sus"],
        ["1P 4P 5P 7m 9m 13m", "", "7sus4b9b13 7b9b13sus4"],
        ["1P 4P 7m 10m", "", "4 quartal"],
        ["1P 5P 7m 9m 11P", "", "11b9"]
    ];

    var NoChordType = __assign(__assign({}, pcset.EmptyPcset), { name: "", quality: "Unknown", intervals: [], aliases: [] });
    var dictionary = [];
    var index = {};
    /**
     * Given a chord name or chroma, return the chord properties
     * @param {string} source - chord name or pitch class set chroma
     * @example
     * import { get } from 'tonaljs/chord-type'
     * get('major') // => { name: 'major', ... }
     */
    function get(type) {
        return index[type] || NoChordType;
    }
    var chordType = core.deprecate("ChordType.chordType", "ChordType.get", get);
    /**
     * Get all chord (long) names
     */
    function names() {
        return dictionary.map(function (chord) { return chord.name; }).filter(function (x) { return x; });
    }
    /**
     * Get all chord symbols
     */
    function symbols() {
        return dictionary.map(function (chord) { return chord.aliases[0]; }).filter(function (x) { return x; });
    }
    /**
     * Keys used to reference chord types
     */
    function keys() {
        return Object.keys(index);
    }
    /**
     * Return a list of all chord types
     */
    function all() {
        return dictionary.slice();
    }
    var entries = core.deprecate("ChordType.entries", "ChordType.all", all);
    /**
     * Clear the dictionary
     */
    function removeAll() {
        dictionary = [];
        index = {};
    }
    /**
     * Add a chord to the dictionary.
     * @param intervals
     * @param aliases
     * @param [fullName]
     */
    function add(intervals, aliases, fullName) {
        var quality = getQuality(intervals);
        var chord = __assign(__assign({}, pcset.get(intervals)), { name: fullName || "", quality: quality,
            intervals: intervals,
            aliases: aliases });
        dictionary.push(chord);
        if (chord.name) {
            index[chord.name] = chord;
        }
        index[chord.setNum] = chord;
        index[chord.chroma] = chord;
        chord.aliases.forEach(function (alias) { return addAlias(chord, alias); });
    }
    function addAlias(chord, alias) {
        index[alias] = chord;
    }
    function getQuality(intervals) {
        var has = function (interval) { return intervals.indexOf(interval) !== -1; };
        return has("5A")
            ? "Augmented"
            : has("3M")
                ? "Major"
                : has("5d")
                    ? "Diminished"
                    : has("3m")
                        ? "Minor"
                        : "Unknown";
    }
    CHORDS.forEach(function (_a) {
        var ivls = _a[0], fullName = _a[1], names = _a[2];
        return add(ivls.split(" "), names.split(" "), fullName);
    });
    dictionary.sort(function (a, b) { return a.setNum - b.setNum; });
    var index$1 = {
        names: names,
        symbols: symbols,
        get: get,
        all: all,
        add: add,
        removeAll: removeAll,
        keys: keys,
        // deprecated
        entries: entries,
        chordType: chordType
    };

    exports.add = add;
    exports.addAlias = addAlias;
    exports.all = all;
    exports.chordType = chordType;
    exports.default = index$1;
    exports.entries = entries;
    exports.get = get;
    exports.keys = keys;
    exports.names = names;
    exports.removeAll = removeAll;
    exports.symbols = symbols;

    Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/core":6,"@tonaljs/pcset":8}],4:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/chord-detect'), require('@tonaljs/chord-type'), require('@tonaljs/core'), require('@tonaljs/pcset'), require('@tonaljs/scale-type')) :
    typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/chord-detect', '@tonaljs/chord-type', '@tonaljs/core', '@tonaljs/pcset', '@tonaljs/scale-type'], factory) :
    (global = global || self, factory(global.Chord = {}, global.chordDetect, global.chordType, global.core, global.pcset, global.scaleType));
}(this, (function (exports, chordDetect, chordType, core, pcset, scaleType) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    var NoChord = {
        empty: true,
        name: "",
        type: "",
        tonic: null,
        setNum: NaN,
        quality: "Unknown",
        chroma: "",
        normalized: "",
        aliases: [],
        notes: [],
        intervals: []
    };
    // 6, 64, 7, 9, 11 and 13 are consider part of the chord
    // (see https://github.com/danigb/tonal/issues/55)
    var NUM_TYPES = /^(6|64|7|9|11|13)$/;
    /**
     * Tokenize a chord name. It returns an array with the tonic and chord type
     * If not tonic is found, all the name is considered the chord name.
     *
     * This function does NOT check if the chord type exists or not. It only tries
     * to split the tonic and chord type.
     *
     * @function
     * @param {string} name - the chord name
     * @return {Array} an array with [tonic, type]
     * @example
     * tokenize("Cmaj7") // => [ "C", "maj7" ]
     * tokenize("C7") // => [ "C", "7" ]
     * tokenize("mMaj7") // => [ null, "mMaj7" ]
     * tokenize("Cnonsense") // => [ null, "nonsense" ]
     */
    function tokenize(name) {
        var _a = core.tokenizeNote(name), letter = _a[0], acc = _a[1], oct = _a[2], type = _a[3];
        if (letter === "") {
            return ["", name];
        }
        // aug is augmented (see https://github.com/danigb/tonal/issues/55)
        if (letter === "A" && type === "ug") {
            return ["", "aug"];
        }
        // see: https://github.com/tonaljs/tonal/issues/70
        if (!type && (oct === "4" || oct === "5")) {
            return [letter + acc, oct];
        }
        if (NUM_TYPES.test(oct)) {
            return [letter + acc, oct + type];
        }
        else {
            return [letter + acc + oct, type];
        }
    }
    /**
     * Get a Chord from a chord name.
     */
    function get(src) {
        var _a = findChord(src), type = _a.type, tonic = _a.tonic;
        if (!type || type.empty) {
            return NoChord;
        }
        var notes = tonic
            ? type.intervals.map(function (i) { return core.transpose(tonic, i); })
            : [];
        var name = tonic ? tonic + " " + type.name : type.name;
        return __assign(__assign({}, type), { name: name, type: type.name, tonic: tonic || "", notes: notes });
    }
    var chord = core.deprecate("Chord.chord", "Chord.get", get);
    function findChord(src) {
        if (!src || !src.length) {
            return {};
        }
        var tokens = Array.isArray(src) ? src : tokenize(src);
        var tonic = core.note(tokens[0]).name;
        var type = chordType.get(tokens[1]);
        if (!type.empty) {
            return { tonic: tonic, type: type };
        }
        else if (tonic && typeof src === "string") {
            return { tonic: "", type: chordType.get(src) };
        }
        else {
            return {};
        }
    }
    /**
     * Transpose a chord name
     *
     * @param {string} chordName - the chord name
     * @return {string} the transposed chord
     *
     * @example
     * transpose('Dm7', 'P4') // => 'Gm7
     */
    function transpose(chordName, interval) {
        var _a = tokenize(chordName), tonic = _a[0], type = _a[1];
        if (!tonic) {
            return name;
        }
        return core.transpose(tonic, interval) + type;
    }
    /**
     * Get all scales where the given chord fits
     *
     * @example
     * chordScales('C7b9')
     * // => ["phrygian dominant", "flamenco", "spanish heptatonic", "half-whole diminished", "chromatic"]
     */
    function chordScales(name) {
        var s = get(name);
        var isChordIncluded = pcset.isSupersetOf(s.chroma);
        return scaleType.all()
            .filter(function (scale) { return isChordIncluded(scale.chroma); })
            .map(function (scale) { return scale.name; });
    }
    /**
     * Get all chords names that are a superset of the given one
     * (has the same notes and at least one more)
     *
     * @function
     * @example
     * extended("CMaj7")
     * // => [ 'Cmaj#4', 'Cmaj7#9#11', 'Cmaj9', 'CM7add13', 'Cmaj13', 'Cmaj9#11', 'CM13#11', 'CM7b9' ]
     */
    function extended(chordName) {
        var s = get(chordName);
        var isSuperset = pcset.isSupersetOf(s.chroma);
        return chordType.all()
            .filter(function (chord) { return isSuperset(chord.chroma); })
            .map(function (chord) { return s.tonic + chord.aliases[0]; });
    }
    /**
     * Find all chords names that are a subset of the given one
     * (has less notes but all from the given chord)
     *
     * @example
     */
    function reduced(chordName) {
        var s = get(chordName);
        var isSubset = pcset.isSubsetOf(s.chroma);
        return chordType.all()
            .filter(function (chord) { return isSubset(chord.chroma); })
            .map(function (chord) { return s.tonic + chord.aliases[0]; });
    }
    var index = {
        get: get,
        detect: chordDetect.detect,
        chordScales: chordScales,
        extended: extended,
        reduced: reduced,
        tokenize: tokenize,
        transpose: transpose,
        // deprecate
        chord: chord
    };

    Object.defineProperty(exports, 'detect', {
        enumerable: true,
        get: function () {
            return chordDetect.detect;
        }
    });
    exports.chord = chord;
    exports.chordScales = chordScales;
    exports.default = index;
    exports.extended = extended;
    exports.get = get;
    exports.reduced = reduced;
    exports.tokenize = tokenize;
    exports.transpose = transpose;

    Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/chord-detect":2,"@tonaljs/chord-type":3,"@tonaljs/core":6,"@tonaljs/pcset":8,"@tonaljs/scale-type":9}],5:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = global || self, factory(global.Collection = {}));
}(this, (function (exports) { 'use strict';

  // ascending range
  function ascR(b, n) {
      var a = [];
      // tslint:disable-next-line:curly
      for (; n--; a[n] = n + b)
          ;
      return a;
  }
  // descending range
  function descR(b, n) {
      var a = [];
      // tslint:disable-next-line:curly
      for (; n--; a[n] = b - n)
          ;
      return a;
  }
  /**
   * Creates a numeric range
   *
   * @param {number} from
   * @param {number} to
   * @return {Array<number>}
   *
   * @example
   * range(-2, 2) // => [-2, -1, 0, 1, 2]
   * range(2, -2) // => [2, 1, 0, -1, -2]
   */
  function range(from, to) {
      return from < to ? ascR(from, to - from + 1) : descR(from, from - to + 1);
  }
  /**
   * Rotates a list a number of times. It"s completly agnostic about the
   * contents of the list.
   *
   * @param {Integer} times - the number of rotations
   * @param {Array} collection
   * @return {Array} the rotated collection
   *
   * @example
   * rotate(1, [1, 2, 3]) // => [2, 3, 1]
   */
  function rotate(times, arr) {
      var len = arr.length;
      var n = ((times % len) + len) % len;
      return arr.slice(n, len).concat(arr.slice(0, n));
  }
  /**
   * Return a copy of the collection with the null values removed
   * @function
   * @param {Array} collection
   * @return {Array}
   *
   * @example
   * compact(["a", "b", null, "c"]) // => ["a", "b", "c"]
   */
  function compact(arr) {
      return arr.filter(function (n) { return n === 0 || n; });
  }
  /**
   * Randomizes the order of the specified collection in-place, using the Fisher–Yates shuffle.
   *
   * @function
   * @param {Array} collection
   * @return {Array} the collection shuffled
   *
   * @example
   * shuffle(["C", "D", "E", "F"]) // => [...]
   */
  function shuffle(arr, rnd) {
      if (rnd === void 0) { rnd = Math.random; }
      var i;
      var t;
      var m = arr.length;
      while (m) {
          i = Math.floor(rnd() * m--);
          t = arr[m];
          arr[m] = arr[i];
          arr[i] = t;
      }
      return arr;
  }
  /**
   * Get all permutations of an collection
   *
   * @param {Array} collection - the collection
   * @return {Array<Array>} an collection with all the permutations
   * @example
   * permutations(["a", "b", "c"])) // =>
   * [
   *   ["a", "b", "c"],
   *   ["b", "a", "c"],
   *   ["b", "c", "a"],
   *   ["a", "c", "b"],
   *   ["c", "a", "b"],
   *   ["c", "b", "a"]
   * ]
   */
  function permutations(arr) {
      if (arr.length === 0) {
          return [[]];
      }
      return permutations(arr.slice(1)).reduce(function (acc, perm) {
          return acc.concat(arr.map(function (e, pos) {
              var newPerm = perm.slice();
              newPerm.splice(pos, 0, arr[0]);
              return newPerm;
          }));
      }, []);
  }
  var index = {
      compact: compact,
      permutations: permutations,
      range: range,
      rotate: rotate,
      shuffle: shuffle
  };

  exports.compact = compact;
  exports.default = index;
  exports.permutations = permutations;
  exports.range = range;
  exports.rotate = rotate;
  exports.shuffle = shuffle;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{}],6:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = global || self, factory(global.Core = {}));
}(this, (function (exports) { 'use strict';

  /**
   * Fill a string with a repeated character
   *
   * @param character
   * @param repetition
   */
  var fillStr = function (s, n) { return Array(Math.abs(n) + 1).join(s); };
  function deprecate(original, alternative, fn) {
      return function () {
          var args = [];
          for (var _i = 0; _i < arguments.length; _i++) {
              args[_i] = arguments[_i];
          }
          // tslint:disable-next-line
          console.warn(original + " is deprecated. Use " + alternative + ".");
          return fn.apply(this, args);
      };
  }

  function isNamed(src) {
      return src !== null && typeof src === "object" && typeof src.name === "string"
          ? true
          : false;
  }

  function isPitch(pitch) {
      return pitch !== null &&
          typeof pitch === "object" &&
          typeof pitch.step === "number" &&
          typeof pitch.alt === "number"
          ? true
          : false;
  }
  // The number of fifths of [C, D, E, F, G, A, B]
  var FIFTHS = [0, 2, 4, -1, 1, 3, 5];
  // The number of octaves it span each step
  var STEPS_TO_OCTS = FIFTHS.map(function (fifths) {
      return Math.floor((fifths * 7) / 12);
  });
  function encode(pitch) {
      var step = pitch.step, alt = pitch.alt, oct = pitch.oct, _a = pitch.dir, dir = _a === void 0 ? 1 : _a;
      var f = FIFTHS[step] + 7 * alt;
      if (oct === undefined) {
          return [dir * f];
      }
      var o = oct - STEPS_TO_OCTS[step] - 4 * alt;
      return [dir * f, dir * o];
  }
  // We need to get the steps from fifths
  // Fifths for CDEFGAB are [ 0, 2, 4, -1, 1, 3, 5 ]
  // We add 1 to fifths to avoid negative numbers, so:
  // for ["F", "C", "G", "D", "A", "E", "B"] we have:
  var FIFTHS_TO_STEPS = [3, 0, 4, 1, 5, 2, 6];
  function decode(coord) {
      var f = coord[0], o = coord[1], dir = coord[2];
      var step = FIFTHS_TO_STEPS[unaltered(f)];
      var alt = Math.floor((f + 1) / 7);
      if (o === undefined) {
          return { step: step, alt: alt, dir: dir };
      }
      var oct = o + 4 * alt + STEPS_TO_OCTS[step];
      return { step: step, alt: alt, oct: oct, dir: dir };
  }
  // Return the number of fifths as if it were unaltered
  function unaltered(f) {
      var i = (f + 1) % 7;
      return i < 0 ? 7 + i : i;
  }

  var NoNote = { empty: true, name: "", pc: "", acc: "" };
  var cache = new Map();
  var stepToLetter = function (step) { return "CDEFGAB".charAt(step); };
  var altToAcc = function (alt) {
      return alt < 0 ? fillStr("b", -alt) : fillStr("#", alt);
  };
  var accToAlt = function (acc) {
      return acc[0] === "b" ? -acc.length : acc.length;
  };
  /**
   * Given a note literal (a note name or a note object), returns the Note object
   * @example
   * note('Bb4') // => { name: "Bb4", midi: 70, chroma: 10, ... }
   */
  function note(src) {
      var cached = cache.get(src);
      if (cached) {
          return cached;
      }
      var value = typeof src === "string"
          ? parse(src)
          : isPitch(src)
              ? note(pitchName(src))
              : isNamed(src)
                  ? note(src.name)
                  : NoNote;
      cache.set(src, value);
      return value;
  }
  var REGEX = /^([a-gA-G]?)(#{1,}|b{1,}|x{1,}|)(-?\d*)\s*(.*)$/;
  /**
   * @private
   */
  function tokenizeNote(str) {
      var m = REGEX.exec(str);
      return [m[1].toUpperCase(), m[2].replace(/x/g, "##"), m[3], m[4]];
  }
  /**
   * @private
   */
  function coordToNote(noteCoord) {
      return note(decode(noteCoord));
  }
  var SEMI = [0, 2, 4, 5, 7, 9, 11];
  function parse(noteName) {
      var tokens = tokenizeNote(noteName);
      if (tokens[0] === "" || tokens[3] !== "") {
          return NoNote;
      }
      var letter = tokens[0];
      var acc = tokens[1];
      var octStr = tokens[2];
      var step = (letter.charCodeAt(0) + 3) % 7;
      var alt = accToAlt(acc);
      var oct = octStr.length ? +octStr : undefined;
      var coord = encode({ step: step, alt: alt, oct: oct });
      var name = letter + acc + octStr;
      var pc = letter + acc;
      var chroma = (SEMI[step] + alt + 120) % 12;
      var o = oct === undefined ? -100 : oct;
      var height = SEMI[step] + alt + 12 * (o + 1);
      var midi = height >= 0 && height <= 127 ? height : null;
      var freq = oct === undefined ? null : Math.pow(2, (height - 69) / 12) * 440;
      return {
          empty: false,
          acc: acc,
          alt: alt,
          chroma: chroma,
          coord: coord,
          freq: freq,
          height: height,
          letter: letter,
          midi: midi,
          name: name,
          oct: oct,
          pc: pc,
          step: step
      };
  }
  function pitchName(props) {
      var step = props.step, alt = props.alt, oct = props.oct;
      var letter = stepToLetter(step);
      if (!letter) {
          return "";
      }
      var pc = letter + altToAcc(alt);
      return oct || oct === 0 ? pc + oct : pc;
  }

  var NoInterval = { empty: true, name: "", acc: "" };
  // shorthand tonal notation (with quality after number)
  var INTERVAL_TONAL_REGEX = "([-+]?\\d+)(d{1,4}|m|M|P|A{1,4})";
  // standard shorthand notation (with quality before number)
  var INTERVAL_SHORTHAND_REGEX = "(AA|A|P|M|m|d|dd)([-+]?\\d+)";
  var REGEX$1 = new RegExp("^" + INTERVAL_TONAL_REGEX + "|" + INTERVAL_SHORTHAND_REGEX + "$");
  /**
   * @private
   */
  function tokenizeInterval(str) {
      var m = REGEX$1.exec("" + str);
      if (m === null) {
          return ["", ""];
      }
      return m[1] ? [m[1], m[2]] : [m[4], m[3]];
  }
  var cache$1 = {};
  /**
   * Get interval properties. It returns an object with:
   *
   * - name: the interval name
   * - num: the interval number
   * - type: 'perfectable' or 'majorable'
   * - q: the interval quality (d, m, M, A)
   * - dir: interval direction (1 ascending, -1 descending)
   * - simple: the simplified number
   * - semitones: the size in semitones
   * - chroma: the interval chroma
   *
   * @param {string} interval - the interval name
   * @return {Object} the interval properties
   *
   * @example
   * import { interval } from '@tonaljs/core'
   * interval('P5').semitones // => 7
   * interval('m3').type // => 'majorable'
   */
  function interval(src) {
      return typeof src === "string"
          ? cache$1[src] || (cache$1[src] = parse$1(src))
          : isPitch(src)
              ? interval(pitchName$1(src))
              : isNamed(src)
                  ? interval(src.name)
                  : NoInterval;
  }
  var SIZES = [0, 2, 4, 5, 7, 9, 11];
  var TYPES = "PMMPPMM";
  function parse$1(str) {
      var tokens = tokenizeInterval(str);
      if (tokens[0] === "") {
          return NoInterval;
      }
      var num = +tokens[0];
      var q = tokens[1];
      var step = (Math.abs(num) - 1) % 7;
      var t = TYPES[step];
      if (t === "M" && q === "P") {
          return NoInterval;
      }
      var type = t === "M" ? "majorable" : "perfectable";
      var name = "" + num + q;
      var dir = num < 0 ? -1 : 1;
      var simple = num === 8 || num === -8 ? num : dir * (step + 1);
      var alt = qToAlt(type, q);
      var oct = Math.floor((Math.abs(num) - 1) / 7);
      var semitones = dir * (SIZES[step] + alt + 12 * oct);
      var chroma = (((dir * (SIZES[step] + alt)) % 12) + 12) % 12;
      var coord = encode({ step: step, alt: alt, oct: oct, dir: dir });
      return {
          empty: false,
          name: name,
          num: num,
          q: q,
          step: step,
          alt: alt,
          dir: dir,
          type: type,
          simple: simple,
          semitones: semitones,
          chroma: chroma,
          coord: coord,
          oct: oct
      };
  }
  /**
   * @private
   */
  function coordToInterval(coord) {
      var f = coord[0], _a = coord[1], o = _a === void 0 ? 0 : _a;
      var isDescending = f * 7 + o * 12 < 0;
      var ivl = isDescending ? [-f, -o, -1] : [f, o, 1];
      return interval(decode(ivl));
  }
  function qToAlt(type, q) {
      return (q === "M" && type === "majorable") ||
          (q === "P" && type === "perfectable")
          ? 0
          : q === "m" && type === "majorable"
              ? -1
              : /^A+$/.test(q)
                  ? q.length
                  : /^d+$/.test(q)
                      ? -1 * (type === "perfectable" ? q.length : q.length + 1)
                      : 0;
  }
  // return the interval name of a pitch
  function pitchName$1(props) {
      var step = props.step, alt = props.alt, _a = props.oct, oct = _a === void 0 ? 0 : _a, dir = props.dir;
      if (!dir) {
          return "";
      }
      var num = step + 1 + 7 * oct;
      var d = dir < 0 ? "-" : "";
      var type = TYPES[step] === "M" ? "majorable" : "perfectable";
      var name = d + num + altToQ(type, alt);
      return name;
  }
  function altToQ(type, alt) {
      if (alt === 0) {
          return type === "majorable" ? "M" : "P";
      }
      else if (alt === -1 && type === "majorable") {
          return "m";
      }
      else if (alt > 0) {
          return fillStr("A", alt);
      }
      else {
          return fillStr("d", type === "perfectable" ? alt : alt + 1);
      }
  }

  /**
   * Transpose a note by an interval.
   *
   * @param {string} note - the note or note name
   * @param {string} interval - the interval or interval name
   * @return {string} the transposed note name or empty string if not valid notes
   * @example
   * import { tranpose } from "@tonaljs/core"
   * transpose("d3", "3M") // => "F#3"
   * transpose("D", "3M") // => "F#"
   * ["C", "D", "E", "F", "G"].map(pc => transpose(pc, "M3)) // => ["E", "F#", "G#", "A", "B"]
   */
  function transpose(noteName, intervalName) {
      var note$1 = note(noteName);
      var interval$1 = interval(intervalName);
      if (note$1.empty || interval$1.empty) {
          return "";
      }
      var noteCoord = note$1.coord;
      var intervalCoord = interval$1.coord;
      var tr = noteCoord.length === 1
          ? [noteCoord[0] + intervalCoord[0]]
          : [noteCoord[0] + intervalCoord[0], noteCoord[1] + intervalCoord[1]];
      return coordToNote(tr).name;
  }
  /**
   * Find the interval distance between two notes or coord classes.
   *
   * To find distance between coord classes, both notes must be coord classes and
   * the interval is always ascending
   *
   * @param {Note|string} from - the note or note name to calculate distance from
   * @param {Note|string} to - the note or note name to calculate distance to
   * @return {string} the interval name or empty string if not valid notes
   *
   */
  function distance(fromNote, toNote) {
      var from = note(fromNote);
      var to = note(toNote);
      if (from.empty || to.empty) {
          return "";
      }
      var fcoord = from.coord;
      var tcoord = to.coord;
      var fifths = tcoord[0] - fcoord[0];
      var octs = fcoord.length === 2 && tcoord.length === 2
          ? tcoord[1] - fcoord[1]
          : -Math.floor((fifths * 7) / 12);
      return coordToInterval([fifths, octs]).name;
  }

  exports.accToAlt = accToAlt;
  exports.altToAcc = altToAcc;
  exports.coordToInterval = coordToInterval;
  exports.coordToNote = coordToNote;
  exports.decode = decode;
  exports.deprecate = deprecate;
  exports.distance = distance;
  exports.encode = encode;
  exports.fillStr = fillStr;
  exports.interval = interval;
  exports.isNamed = isNamed;
  exports.isPitch = isPitch;
  exports.note = note;
  exports.stepToLetter = stepToLetter;
  exports.tokenizeInterval = tokenizeInterval;
  exports.tokenizeNote = tokenizeNote;
  exports.transpose = transpose;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{}],7:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core'], factory) :
  (global = global || self, factory(global.Midi = {}, global.core));
}(this, (function (exports, core) { 'use strict';

  function isMidi(arg) {
      return +arg >= 0 && +arg <= 127;
  }
  /**
   * Get the note midi number (a number between 0 and 127)
   *
   * It returns undefined if not valid note name
   *
   * @function
   * @param {string|number} note - the note name or midi number
   * @return {Integer} the midi number or undefined if not valid note
   * @example
   * import { toMidi } from '@tonaljs/midi'
   * toMidi("C4") // => 60
   * toMidi(60) // => 60
   * toMidi('60') // => 60
   */
  function toMidi(note) {
      if (isMidi(note)) {
          return +note;
      }
      var n = core.note(note);
      return n.empty ? null : n.midi;
  }
  /**
   * Get the frequency in hertzs from midi number
   *
   * @param {number} midi - the note midi number
   * @param {number} [tuning = 440] - A4 tuning frequency in Hz (440 by default)
   * @return {number} the frequency or null if not valid note midi
   * @example
   * import { midiToFreq} from '@tonaljs/midi'
   * midiToFreq(69) // => 440
   */
  function midiToFreq(midi, tuning) {
      if (tuning === void 0) { tuning = 440; }
      return Math.pow(2, (midi - 69) / 12) * tuning;
  }
  var L2 = Math.log(2);
  var L440 = Math.log(440);
  /**
   * Get the midi number from a frequency in hertz. The midi number can
   * contain decimals (with two digits precission)
   *
   * @param {number} frequency
   * @return {number}
   * @example
   * import { freqToMidi} from '@tonaljs/midi'
   * freqToMidi(220)); //=> 57
   * freqToMidi(261.62)); //=> 60
   * freqToMidi(261)); //=> 59.96
   */
  function freqToMidi(freq) {
      var v = (12 * (Math.log(freq) - L440)) / L2 + 69;
      return Math.round(v * 100) / 100;
  }
  var SHARPS = "C C# D D# E F F# G G# A A# B".split(" ");
  var FLATS = "C Db D Eb E F Gb G Ab A Bb B".split(" ");
  /**
   * Given a midi number, returns a note name. The altered notes will have
   * flats unless explicitly set with the optional `useSharps` parameter.
   *
   * @function
   * @param {number} midi - the midi note number
   * @param {Object} options = default: `{ sharps: false, pitchClass: false }`
   * @param {boolean} useSharps - (Optional) set to true to use sharps instead of flats
   * @return {string} the note name
   * @example
   * import { midiToNoteName } from '@tonaljs/midi'
   * midiToNoteName(61) // => "Db4"
   * midiToNoteName(61, { pitchClass: true }) // => "Db"
   * midiToNoteName(61, { sharps: true }) // => "C#4"
   * midiToNoteName(61, { pitchClass: true, sharps: true }) // => "C#"
   * // it rounds to nearest note
   * midiToNoteName(61.7) // => "D4"
   */
  function midiToNoteName(midi, options) {
      if (options === void 0) { options = {}; }
      midi = Math.round(midi);
      var pcs = options.sharps === true ? SHARPS : FLATS;
      var pc = pcs[midi % 12];
      if (options.pitchClass) {
          return pc;
      }
      var o = Math.floor(midi / 12) - 1;
      return pc + o;
  }
  var index = { isMidi: isMidi, toMidi: toMidi, midiToFreq: midiToFreq, midiToNoteName: midiToNoteName, freqToMidi: freqToMidi };

  exports.default = index;
  exports.freqToMidi = freqToMidi;
  exports.isMidi = isMidi;
  exports.midiToFreq = midiToFreq;
  exports.midiToNoteName = midiToNoteName;
  exports.toMidi = toMidi;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/core":6}],8:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/collection'), require('@tonaljs/core')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/collection', '@tonaljs/core'], factory) :
  (global = global || self, factory(global.Pcset = {}, global.collection, global.core));
}(this, (function (exports, collection, core) { 'use strict';

  var _a;
  var EmptyPcset = {
      empty: true,
      name: "",
      setNum: 0,
      chroma: "000000000000",
      normalized: "000000000000",
      intervals: []
  };
  // UTILITIES
  var setNumToChroma = function (num) { return Number(num).toString(2); };
  var chromaToNumber = function (chroma) { return parseInt(chroma, 2); };
  var REGEX = /^[01]{12}$/;
  function isChroma(set) {
      return REGEX.test(set);
  }
  var isPcsetNum = function (set) {
      return typeof set === "number" && set >= 0 && set <= 4095;
  };
  var isPcset = function (set) { return set && isChroma(set.chroma); };
  var cache = (_a = {}, _a[EmptyPcset.chroma] = EmptyPcset, _a);
  /**
   * Get the pitch class set of a collection of notes or set number or chroma
   */
  function get(src) {
      var chroma = isChroma(src)
          ? src
          : isPcsetNum(src)
              ? setNumToChroma(src)
              : Array.isArray(src)
                  ? listToChroma(src)
                  : isPcset(src)
                      ? src.chroma
                      : EmptyPcset.chroma;
      return (cache[chroma] = cache[chroma] || chromaToPcset(chroma));
  }
  /**
   * Use Pcset.properties
   * @function
   * @deprecated
   */
  var pcset = core.deprecate("Pcset.pcset", "Pcset.get", get);
  /**
   * Get pitch class set chroma
   * @function
   * @example
   * Pcset.chroma(["c", "d", "e"]); //=> "101010000000"
   */
  var chroma = function (set) { return get(set).chroma; };
  /**
   * Get intervals (from C) of a set
   * @function
   * @example
   * Pcset.intervals(["c", "d", "e"]); //=>
   */
  var intervals = function (set) { return get(set).intervals; };
  /**
   * Get pitch class set number
   * @function
   * @example
   * Pcset.num(["c", "d", "e"]); //=> 2192
   */
  var num = function (set) { return get(set).setNum; };
  var IVLS = [
      "1P",
      "2m",
      "2M",
      "3m",
      "3M",
      "4P",
      "5d",
      "5P",
      "6m",
      "6M",
      "7m",
      "7M"
  ];
  /**
   * @private
   * Get the intervals of a pcset *starting from C*
   * @param {Set} set - the pitch class set
   * @return {IntervalName[]} an array of interval names or an empty array
   * if not a valid pitch class set
   */
  function chromaToIntervals(chroma) {
      var intervals = [];
      for (var i = 0; i < 12; i++) {
          // tslint:disable-next-line:curly
          if (chroma.charAt(i) === "1")
              intervals.push(IVLS[i]);
      }
      return intervals;
  }
  /**
   * Get a list of all possible pitch class sets (all possible chromas) *having
   * C as root*. There are 2048 different chromas. If you want them with another
   * note you have to transpose it
   *
   * @see http://allthescales.org/
   * @return {Array<PcsetChroma>} an array of possible chromas from '10000000000' to '11111111111'
   */
  function chromas() {
      return collection.range(2048, 4095).map(setNumToChroma);
  }
  /**
   * Given a a list of notes or a pcset chroma, produce the rotations
   * of the chroma discarding the ones that starts with "0"
   *
   * This is used, for example, to get all the modes of a scale.
   *
   * @param {Array|string} set - the list of notes or pitchChr of the set
   * @param {boolean} normalize - (Optional, true by default) remove all
   * the rotations that starts with "0"
   * @return {Array<string>} an array with all the modes of the chroma
   *
   * @example
   * Pcset.modes(["C", "D", "E"]).map(Pcset.intervals)
   */
  function modes(set, normalize) {
      if (normalize === void 0) { normalize = true; }
      var pcs = get(set);
      var binary = pcs.chroma.split("");
      return collection.compact(binary.map(function (_, i) {
          var r = collection.rotate(i, binary);
          return normalize && r[0] === "0" ? null : r.join("");
      }));
  }
  /**
   * Test if two pitch class sets are numentical
   *
   * @param {Array|string} set1 - one of the pitch class sets
   * @param {Array|string} set2 - the other pitch class set
   * @return {boolean} true if they are equal
   * @example
   * Pcset.isEqual(["c2", "d3"], ["c5", "d2"]) // => true
   */
  function isEqual(s1, s2) {
      return get(s1).setNum === get(s2).setNum;
  }
  /**
   * Create a function that test if a collection of notes is a
   * subset of a given set
   *
   * The function is curryfied.
   *
   * @param {PcsetChroma|NoteName[]} set - the superset to test against (chroma or
   * list of notes)
   * @return{function(PcsetChroma|NoteNames[]): boolean} a function accepting a set
   * to test against (chroma or list of notes)
   * @example
   * const inCMajor = Pcset.isSubsetOf(["C", "E", "G"])
   * inCMajor(["e6", "c4"]) // => true
   * inCMajor(["e6", "c4", "d3"]) // => false
   */
  function isSubsetOf(set) {
      var s = get(set).setNum;
      return function (notes) {
          var o = get(notes).setNum;
          // tslint:disable-next-line: no-bitwise
          return s && s !== o && (o & s) === o;
      };
  }
  /**
   * Create a function that test if a collection of notes is a
   * superset of a given set (it contains all notes and at least one more)
   *
   * @param {Set} set - an array of notes or a chroma set string to test against
   * @return {(subset: Set): boolean} a function that given a set
   * returns true if is a subset of the first one
   * @example
   * const extendsCMajor = Pcset.isSupersetOf(["C", "E", "G"])
   * extendsCMajor(["e6", "a", "c4", "g2"]) // => true
   * extendsCMajor(["c6", "e4", "g3"]) // => false
   */
  function isSupersetOf(set) {
      var s = get(set).setNum;
      return function (notes) {
          var o = get(notes).setNum;
          // tslint:disable-next-line: no-bitwise
          return s && s !== o && (o | s) === o;
      };
  }
  /**
   * Test if a given pitch class set includes a note
   *
   * @param {Array<string>} set - the base set to test against
   * @param {string} note - the note to test
   * @return {boolean} true if the note is included in the pcset
   *
   * Can be partially applied
   *
   * @example
   * const isNoteInCMajor = isNoteIncludedIn(['C', 'E', 'G'])
   * isNoteInCMajor('C4') // => true
   * isNoteInCMajor('C#4') // => false
   */
  function isNoteIncludedIn(set) {
      var s = get(set);
      return function (noteName) {
          var n = core.note(noteName);
          return s && !n.empty && s.chroma.charAt(n.chroma) === "1";
      };
  }
  /** @deprecated use: isNoteIncludedIn */
  var includes = isNoteIncludedIn;
  /**
   * Filter a list with a pitch class set
   *
   * @param {Array|string} set - the pitch class set notes
   * @param {Array|string} notes - the note list to be filtered
   * @return {Array} the filtered notes
   *
   * @example
   * Pcset.filter(["C", "D", "E"], ["c2", "c#2", "d2", "c3", "c#3", "d3"]) // => [ "c2", "d2", "c3", "d3" ])
   * Pcset.filter(["C2"], ["c2", "c#2", "d2", "c3", "c#3", "d3"]) // => [ "c2", "c3" ])
   */
  function filter(set) {
      var isIncluded = isNoteIncludedIn(set);
      return function (notes) {
          return notes.filter(isIncluded);
      };
  }
  var index = {
      get: get,
      chroma: chroma,
      num: num,
      intervals: intervals,
      chromas: chromas,
      isSupersetOf: isSupersetOf,
      isSubsetOf: isSubsetOf,
      isNoteIncludedIn: isNoteIncludedIn,
      isEqual: isEqual,
      filter: filter,
      modes: modes,
      // deprecated
      pcset: pcset
  };
  //// PRIVATE ////
  function chromaRotations(chroma) {
      var binary = chroma.split("");
      return binary.map(function (_, i) { return collection.rotate(i, binary).join(""); });
  }
  function chromaToPcset(chroma) {
      var setNum = chromaToNumber(chroma);
      var normalizedNum = chromaRotations(chroma)
          .map(chromaToNumber)
          .filter(function (n) { return n >= 2048; })
          .sort()[0];
      var normalized = setNumToChroma(normalizedNum);
      var intervals = chromaToIntervals(chroma);
      return {
          empty: false,
          name: "",
          setNum: setNum,
          chroma: chroma,
          normalized: normalized,
          intervals: intervals
      };
  }
  function listToChroma(set) {
      if (set.length === 0) {
          return EmptyPcset.chroma;
      }
      var pitch;
      var binary = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      // tslint:disable-next-line:prefer-for-of
      for (var i = 0; i < set.length; i++) {
          pitch = core.note(set[i]);
          // tslint:disable-next-line: curly
          if (pitch.empty)
              pitch = core.interval(set[i]);
          // tslint:disable-next-line: curly
          if (!pitch.empty)
              binary[pitch.chroma] = 1;
      }
      return binary.join("");
  }

  exports.EmptyPcset = EmptyPcset;
  exports.chromaToIntervals = chromaToIntervals;
  exports.chromas = chromas;
  exports.default = index;
  exports.filter = filter;
  exports.get = get;
  exports.includes = includes;
  exports.isEqual = isEqual;
  exports.isNoteIncludedIn = isNoteIncludedIn;
  exports.isSubsetOf = isSubsetOf;
  exports.isSupersetOf = isSupersetOf;
  exports.modes = modes;
  exports.pcset = pcset;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/collection":5,"@tonaljs/core":6}],9:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core'), require('@tonaljs/pcset')) :
    typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core', '@tonaljs/pcset'], factory) :
    (global = global || self, factory(global.ScaleType = {}, global.core, global.pcset));
}(this, (function (exports, core, pcset) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    // SCALES
    // Format: ["intervals", "name", "alias1", "alias2", ...]
    var SCALES = [
        // 5-note scales
        ["1P 2M 3M 5P 6M", "major pentatonic", "pentatonic"],
        ["1P 3M 4P 5P 7M", "ionian pentatonic"],
        ["1P 3M 4P 5P 7m", "mixolydian pentatonic", "indian"],
        ["1P 2M 4P 5P 6M", "ritusen"],
        ["1P 2M 4P 5P 7m", "egyptian"],
        ["1P 3M 4P 5d 7m", "neopolitan major pentatonic"],
        ["1P 3m 4P 5P 6m", "vietnamese 1"],
        ["1P 2m 3m 5P 6m", "pelog"],
        ["1P 2m 4P 5P 6m", "kumoijoshi"],
        ["1P 2M 3m 5P 6m", "hirajoshi"],
        ["1P 2m 4P 5d 7m", "iwato"],
        ["1P 2m 4P 5P 7m", "in-sen"],
        ["1P 3M 4A 5P 7M", "lydian pentatonic", "chinese"],
        ["1P 3m 4P 6m 7m", "malkos raga"],
        ["1P 3m 4P 5d 7m", "locrian pentatonic", "minor seven flat five pentatonic"],
        ["1P 3m 4P 5P 7m", "minor pentatonic", "vietnamese 2"],
        ["1P 3m 4P 5P 6M", "minor six pentatonic"],
        ["1P 2M 3m 5P 6M", "flat three pentatonic", "kumoi"],
        ["1P 2M 3M 5P 6m", "flat six pentatonic"],
        ["1P 2m 3M 5P 6M", "scriabin"],
        ["1P 3M 5d 6m 7m", "whole tone pentatonic"],
        ["1P 3M 4A 5A 7M", "lydian #5P pentatonic"],
        ["1P 3M 4A 5P 7m", "lydian dominant pentatonic"],
        ["1P 3m 4P 5P 7M", "minor #7M pentatonic"],
        ["1P 3m 4d 5d 7m", "super locrian pentatonic"],
        // 6-note scales
        ["1P 2M 3m 4P 5P 7M", "minor hexatonic"],
        ["1P 2A 3M 5P 5A 7M", "augmented"],
        ["1P 3m 4P 5d 5P 7m", "minor blues", "blues"],
        ["1P 2M 3m 3M 5P 6M", "major blues"],
        ["1P 2M 4P 5P 6M 7m", "piongio"],
        ["1P 2m 3M 4A 6M 7m", "prometheus neopolitan"],
        ["1P 2M 3M 4A 6M 7m", "prometheus"],
        ["1P 2m 3M 5d 6m 7m", "mystery #1"],
        ["1P 2m 3M 4P 5A 6M", "six tone symmetric"],
        ["1P 2M 3M 4A 5A 7m", "whole tone"],
        // 7-note scales
        ["1P 2M 3M 4P 5d 6m 7m", "locrian major", "arabian"],
        ["1P 2m 3M 4A 5P 6m 7M", "double harmonic lydian"],
        ["1P 2M 3m 4P 5P 6m 7M", "harmonic minor"],
        [
            "1P 2m 3m 3M 5d 6m 7m",
            "altered",
            "super locrian",
            "diminished whole tone",
            "pomeroy"
        ],
        ["1P 2M 3m 4P 5d 6m 7m", "locrian #2", "half-diminished", '"aeolian b5'],
        [
            "1P 2M 3M 4P 5P 6m 7m",
            "mixolydian b6",
            "melodic minor fifth mode",
            "hindu"
        ],
        ["1P 2M 3M 4A 5P 6M 7m", "lydian dominant", "lydian b7", "overtone"],
        ["1P 2M 3M 4A 5P 6M 7M", "lydian"],
        ["1P 2M 3M 4A 5A 6M 7M", "lydian augmented"],
        [
            "1P 2m 3m 4P 5P 6M 7m",
            "dorian b2",
            "phrygian #6",
            "melodic minor second mode"
        ],
        ["1P 2M 3m 4P 5P 6M 7M", "melodic minor"],
        ["1P 2m 3m 4P 5d 6m 7m", "locrian"],
        [
            "1P 2m 3m 4d 5d 6m 7d",
            "ultralocrian",
            "superlocrian bb7",
            "·superlocrian diminished"
        ],
        ["1P 2m 3m 4P 5d 6M 7m", "locrian 6", "locrian natural 6", "locrian sharp 6"],
        ["1P 2A 3M 4P 5P 5A 7M", "augmented heptatonic"],
        ["1P 2M 3m 5d 5P 6M 7m", "romanian minor"],
        ["1P 2M 3m 4A 5P 6M 7m", "dorian #4"],
        ["1P 2M 3m 4A 5P 6M 7M", "lydian diminished"],
        ["1P 2m 3m 4P 5P 6m 7m", "phrygian"],
        ["1P 2M 3M 4A 5A 7m 7M", "leading whole tone"],
        ["1P 2M 3M 4A 5P 6m 7m", "lydian minor"],
        ["1P 2m 3M 4P 5P 6m 7m", "phrygian dominant", "spanish", "phrygian major"],
        ["1P 2m 3m 4P 5P 6m 7M", "balinese"],
        ["1P 2m 3m 4P 5P 6M 7M", "neopolitan major"],
        ["1P 2M 3m 4P 5P 6m 7m", "aeolian", "minor"],
        ["1P 2M 3M 4P 5P 6m 7M", "harmonic major"],
        ["1P 2m 3M 4P 5P 6m 7M", "double harmonic major", "gypsy"],
        ["1P 2M 3m 4P 5P 6M 7m", "dorian"],
        ["1P 2M 3m 4A 5P 6m 7M", "hungarian minor"],
        ["1P 2A 3M 4A 5P 6M 7m", "hungarian major"],
        ["1P 2m 3M 4P 5d 6M 7m", "oriental"],
        ["1P 2m 3m 3M 4A 5P 7m", "flamenco"],
        ["1P 2m 3m 4A 5P 6m 7M", "todi raga"],
        ["1P 2M 3M 4P 5P 6M 7m", "mixolydian", "dominant"],
        ["1P 2m 3M 4P 5d 6m 7M", "persian"],
        ["1P 2M 3M 4P 5P 6M 7M", "major", "ionian"],
        ["1P 2m 3M 5d 6m 7m 7M", "enigmatic"],
        [
            "1P 2M 3M 4P 5A 6M 7M",
            "major augmented",
            "major #5",
            "ionian augmented",
            "ionian #5"
        ],
        ["1P 2A 3M 4A 5P 6M 7M", "lydian #9"],
        // 8-note scales
        ["1P 2m 3M 4P 4A 5P 6m 7M", "purvi raga"],
        ["1P 2m 3m 3M 4P 5P 6m 7m", "spanish heptatonic"],
        ["1P 2M 3M 4P 5P 6M 7m 7M", "bebop"],
        ["1P 2M 3m 3M 4P 5P 6M 7m", "bebop minor"],
        ["1P 2M 3M 4P 5P 5A 6M 7M", "bebop major"],
        ["1P 2m 3m 4P 5d 5P 6m 7m", "bebop locrian"],
        ["1P 2M 3m 4P 5P 6m 7m 7M", "minor bebop"],
        ["1P 2M 3m 4P 5d 6m 6M 7M", "diminished", "whole-half diminished"],
        ["1P 2M 3M 4P 5d 5P 6M 7M", "ichikosucho"],
        ["1P 2M 3m 4P 5P 6m 6M 7M", "minor six diminished"],
        ["1P 2m 3m 3M 4A 5P 6M 7m", "half-whole diminished", "dominant diminished"],
        ["1P 3m 3M 4P 5P 6M 7m 7M", "kafi raga"],
        // 9-note scales
        ["1P 2M 3m 3M 4P 5d 5P 6M 7m", "composite blues"],
        // 12-note scales
        ["1P 2m 2M 3m 3M 4P 5d 5P 6m 6M 7m 7M", "chromatic"]
    ];

    var NoScaleType = __assign(__assign({}, pcset.EmptyPcset), { intervals: [], aliases: [] });
    var dictionary = [];
    var index = {};
    function names() {
        return dictionary.map(function (scale) { return scale.name; });
    }
    /**
     * Given a scale name or chroma, return the scale properties
     *
     * @param {string} type - scale name or pitch class set chroma
     * @example
     * import { get } from 'tonaljs/scale-type'
     * get('major') // => { name: 'major', ... }
     */
    function get(type) {
        return index[type] || NoScaleType;
    }
    var scaleType = core.deprecate("ScaleDictionary.scaleType", "ScaleType.get", get);
    /**
     * Return a list of all scale types
     */
    function all() {
        return dictionary.slice();
    }
    var entries = core.deprecate("ScaleDictionary.entries", "ScaleType.all", all);
    /**
     * Keys used to reference scale types
     */
    function keys() {
        return Object.keys(index);
    }
    /**
     * Clear the dictionary
     */
    function removeAll() {
        dictionary = [];
        index = {};
    }
    /**
     * Add a scale into dictionary
     * @param intervals
     * @param name
     * @param aliases
     */
    function add(intervals, name, aliases) {
        if (aliases === void 0) { aliases = []; }
        var scale = __assign(__assign({}, pcset.get(intervals)), { name: name, intervals: intervals, aliases: aliases });
        dictionary.push(scale);
        index[scale.name] = scale;
        index[scale.setNum] = scale;
        index[scale.chroma] = scale;
        scale.aliases.forEach(function (alias) { return addAlias(scale, alias); });
        return scale;
    }
    function addAlias(scale, alias) {
        index[alias] = scale;
    }
    SCALES.forEach(function (_a) {
        var ivls = _a[0], name = _a[1], aliases = _a.slice(2);
        return add(ivls.split(" "), name, aliases);
    });
    var index$1 = {
        names: names,
        get: get,
        all: all,
        add: add,
        removeAll: removeAll,
        keys: keys,
        // deprecated
        entries: entries,
        scaleType: scaleType
    };

    exports.NoScaleType = NoScaleType;
    exports.add = add;
    exports.addAlias = addAlias;
    exports.all = all;
    exports.default = index$1;
    exports.entries = entries;
    exports.get = get;
    exports.keys = keys;
    exports.names = names;
    exports.removeAll = removeAll;
    exports.scaleType = scaleType;

    Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/core":6,"@tonaljs/pcset":8}],10:[function(require,module,exports){
/*

WebMidi v2.5.1

WebMidi.js helps you tame the Web MIDI API. Send and receive MIDI messages with ease. Control instruments with user-friendly functions (playNote, sendPitchBend, etc.). React to MIDI input with simple event listeners (noteon, pitchbend, controlchange, etc.).
https://github.com/djipco/webmidi


The MIT License (MIT)

Copyright (c) 2015-2019, Jean-Philippe Côté

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/


!function(scope){"use strict";function WebMidi(){if(WebMidi.prototype._singleton)throw new Error("WebMidi is a singleton, it cannot be instantiated directly.");(WebMidi.prototype._singleton=this)._inputs=[],this._outputs=[],this._userHandlers={},this._stateChangeQueue=[],this._processingStateChange=!1,this._midiInterfaceEvents=["connected","disconnected"],this._nrpnBuffer=[[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]],this._nrpnEventsEnabled=!0,this._nrpnTypes=["entry","increment","decrement"],this._notes=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],this._semitones={C:0,D:2,E:4,F:5,G:7,A:9,B:11},Object.defineProperties(this,{MIDI_SYSTEM_MESSAGES:{value:{sysex:240,timecode:241,songposition:242,songselect:243,tuningrequest:246,sysexend:247,clock:248,start:250,continue:251,stop:252,activesensing:254,reset:255,midimessage:0,unknownsystemmessage:-1},writable:!1,enumerable:!0,configurable:!1},MIDI_CHANNEL_MESSAGES:{value:{noteoff:8,noteon:9,keyaftertouch:10,controlchange:11,channelmode:11,nrpn:11,programchange:12,channelaftertouch:13,pitchbend:14},writable:!1,enumerable:!0,configurable:!1},MIDI_REGISTERED_PARAMETER:{value:{pitchbendrange:[0,0],channelfinetuning:[0,1],channelcoarsetuning:[0,2],tuningprogram:[0,3],tuningbank:[0,4],modulationrange:[0,5],azimuthangle:[61,0],elevationangle:[61,1],gain:[61,2],distanceratio:[61,3],maximumdistance:[61,4],maximumdistancegain:[61,5],referencedistanceratio:[61,6],panspreadangle:[61,7],rollangle:[61,8]},writable:!1,enumerable:!0,configurable:!1},MIDI_CONTROL_CHANGE_MESSAGES:{value:{bankselectcoarse:0,modulationwheelcoarse:1,breathcontrollercoarse:2,footcontrollercoarse:4,portamentotimecoarse:5,dataentrycoarse:6,volumecoarse:7,balancecoarse:8,pancoarse:10,expressioncoarse:11,effectcontrol1coarse:12,effectcontrol2coarse:13,generalpurposeslider1:16,generalpurposeslider2:17,generalpurposeslider3:18,generalpurposeslider4:19,bankselectfine:32,modulationwheelfine:33,breathcontrollerfine:34,footcontrollerfine:36,portamentotimefine:37,dataentryfine:38,volumefine:39,balancefine:40,panfine:42,expressionfine:43,effectcontrol1fine:44,effectcontrol2fine:45,holdpedal:64,portamento:65,sustenutopedal:66,softpedal:67,legatopedal:68,hold2pedal:69,soundvariation:70,resonance:71,soundreleasetime:72,soundattacktime:73,brightness:74,soundcontrol6:75,soundcontrol7:76,soundcontrol8:77,soundcontrol9:78,soundcontrol10:79,generalpurposebutton1:80,generalpurposebutton2:81,generalpurposebutton3:82,generalpurposebutton4:83,reverblevel:91,tremololevel:92,choruslevel:93,celestelevel:94,phaserlevel:95,databuttonincrement:96,databuttondecrement:97,nonregisteredparametercoarse:98,nonregisteredparameterfine:99,registeredparametercoarse:100,registeredparameterfine:101},writable:!1,enumerable:!0,configurable:!1},MIDI_NRPN_MESSAGES:{value:{entrymsb:6,entrylsb:38,increment:96,decrement:97,paramlsb:98,parammsb:99,nullactiveparameter:127},writable:!1,enumerable:!0,configurable:!1},MIDI_CHANNEL_MODE_MESSAGES:{value:{allsoundoff:120,resetallcontrollers:121,localcontrol:122,allnotesoff:123,omnimodeoff:124,omnimodeon:125,monomodeon:126,polymodeon:127},writable:!1,enumerable:!0,configurable:!1},octaveOffset:{value:0,writable:!0,enumerable:!0,configurable:!1}}),Object.defineProperties(this,{supported:{enumerable:!0,get:function(){return"requestMIDIAccess"in navigator}},enabled:{enumerable:!0,get:function(){return void 0!==this.interface}.bind(this)},inputs:{enumerable:!0,get:function(){return this._inputs}.bind(this)},outputs:{enumerable:!0,get:function(){return this._outputs}.bind(this)},sysexEnabled:{enumerable:!0,get:function(){return!(!this.interface||!this.interface.sysexEnabled)}.bind(this)},nrpnEventsEnabled:{enumerable:!0,get:function(){return!!this._nrpnEventsEnabled}.bind(this),set:function(enabled){return this._nrpnEventsEnabled=enabled,this._nrpnEventsEnabled}},nrpnTypes:{enumerable:!0,get:function(){return this._nrpnTypes}.bind(this)},time:{enumerable:!0,get:function(){return performance.now()}}})}var wm=new WebMidi;function Input(midiInput){var that=this;this._userHandlers={channel:{},system:{}},this._midiInput=midiInput,Object.defineProperties(this,{connection:{enumerable:!0,get:function(){return that._midiInput.connection}},id:{enumerable:!0,get:function(){return that._midiInput.id}},manufacturer:{enumerable:!0,get:function(){return that._midiInput.manufacturer}},name:{enumerable:!0,get:function(){return that._midiInput.name}},state:{enumerable:!0,get:function(){return that._midiInput.state}},type:{enumerable:!0,get:function(){return that._midiInput.type}}}),this._initializeUserHandlers(),this._midiInput.onmidimessage=this._onMidiMessage.bind(this)}function Output(midiOutput){var that=this;this._midiOutput=midiOutput,Object.defineProperties(this,{connection:{enumerable:!0,get:function(){return that._midiOutput.connection}},id:{enumerable:!0,get:function(){return that._midiOutput.id}},manufacturer:{enumerable:!0,get:function(){return that._midiOutput.manufacturer}},name:{enumerable:!0,get:function(){return that._midiOutput.name}},state:{enumerable:!0,get:function(){return that._midiOutput.state}},type:{enumerable:!0,get:function(){return that._midiOutput.type}}})}WebMidi.prototype.enable=function(callback,sysex){this.enabled||(this.supported?navigator.requestMIDIAccess({sysex:sysex}).then(function(midiAccess){var promiseTimeout,events=[],promises=[];this.interface=midiAccess,this._resetInterfaceUserHandlers(),this.interface.onstatechange=function(e){events.push(e)};for(var inputs=midiAccess.inputs.values(),input=inputs.next();input&&!input.done;input=inputs.next())promises.push(input.value.open());for(var outputs=midiAccess.outputs.values(),output=outputs.next();output&&!output.done;output=outputs.next())promises.push(output.value.open());function onPortsOpen(){clearTimeout(promiseTimeout),this._updateInputsAndOutputs(),this.interface.onstatechange=this._onInterfaceStateChange.bind(this),"function"==typeof callback&&callback.call(this),events.forEach(function(event){this._onInterfaceStateChange(event)}.bind(this))}promiseTimeout=setTimeout(onPortsOpen.bind(this),200),Promise&&Promise.all(promises).catch(function(err){}).then(onPortsOpen.bind(this))}.bind(this),function(err){"function"==typeof callback&&callback.call(this,err)}.bind(this)):"function"==typeof callback&&callback(new Error("The Web MIDI API is not supported by your browser.")))},WebMidi.prototype.disable=function(){if(!this.supported)throw new Error("The Web MIDI API is not supported by your browser.");this.interface&&(this.interface.onstatechange=void 0),this.interface=void 0,this._inputs=[],this._outputs=[],this._nrpnEventsEnabled=!0,this._resetInterfaceUserHandlers()},WebMidi.prototype.addListener=function(type,listener){if(!this.enabled)throw new Error("WebMidi must be enabled before adding event listeners.");if("function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(!(0<=this._midiInterfaceEvents.indexOf(type)))throw new TypeError("The specified event type is not supported.");return this._userHandlers[type].push(listener),this},WebMidi.prototype.hasListener=function(type,listener){if(!this.enabled)throw new Error("WebMidi must be enabled before checking event listeners.");if("function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(!(0<=this._midiInterfaceEvents.indexOf(type)))throw new TypeError("The specified event type is not supported.");for(var o=0;o<this._userHandlers[type].length;o++)if(this._userHandlers[type][o]===listener)return!0;return!1},WebMidi.prototype.removeListener=function(type,listener){if(!this.enabled)throw new Error("WebMidi must be enabled before removing event listeners.");if(void 0!==listener&&"function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(0<=this._midiInterfaceEvents.indexOf(type))if(listener)for(var o=0;o<this._userHandlers[type].length;o++)this._userHandlers[type][o]===listener&&this._userHandlers[type].splice(o,1);else this._userHandlers[type]=[];else{if(void 0!==type)throw new TypeError("The specified event type is not supported.");this._resetInterfaceUserHandlers()}return this},WebMidi.prototype.toMIDIChannels=function(channel){var channels;if("all"===channel||void 0===channel)channels=["all"];else{if("none"===channel)return channels=[];channels=Array.isArray(channel)?channel:[channel]}return-1<channels.indexOf("all")&&(channels=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]),channels.map(function(ch){return parseInt(ch)}).filter(function(ch){return 1<=ch&&ch<=16})},WebMidi.prototype.getInputById=function(id){if(!this.enabled)throw new Error("WebMidi is not enabled.");id=String(id);for(var i=0;i<this.inputs.length;i++)if(this.inputs[i].id===id)return this.inputs[i];return!1},WebMidi.prototype.getOutputById=function(id){if(!this.enabled)throw new Error("WebMidi is not enabled.");id=String(id);for(var i=0;i<this.outputs.length;i++)if(this.outputs[i].id===id)return this.outputs[i];return!1},WebMidi.prototype.getInputByName=function(name){if(!this.enabled)throw new Error("WebMidi is not enabled.");for(var i=0;i<this.inputs.length;i++)if(~this.inputs[i].name.indexOf(name))return this.inputs[i];return!1},WebMidi.prototype.getOctave=function(number){if(null!=number&&0<=number&&number<=127)return Math.floor(Math.floor(number)/12-1)+Math.floor(wm.octaveOffset)},WebMidi.prototype.getOutputByName=function(name){if(!this.enabled)throw new Error("WebMidi is not enabled.");for(var i=0;i<this.outputs.length;i++)if(~this.outputs[i].name.indexOf(name))return this.outputs[i];return!1},WebMidi.prototype.guessNoteNumber=function(input){var output=!1;if(input&&input.toFixed&&0<=input&&input<=127?output=Math.round(input):0<=parseInt(input)&&parseInt(input)<=127?output=parseInt(input):("string"==typeof input||input instanceof String)&&(output=this.noteNameToNumber(input)),!1===output)throw new Error("Invalid input value ("+input+").");return output},WebMidi.prototype.noteNameToNumber=function(name){"string"!=typeof name&&(name="");var matches=name.match(/([CDEFGAB])(#{0,2}|b{0,2})(-?\d+)/i);if(!matches)throw new RangeError("Invalid note name.");var semitones=wm._semitones[matches[1].toUpperCase()],result=12*(parseInt(matches[3])+1-Math.floor(wm.octaveOffset))+semitones;if(-1<matches[2].toLowerCase().indexOf("b")?result-=matches[2].length:-1<matches[2].toLowerCase().indexOf("#")&&(result+=matches[2].length),result<0||127<result)throw new RangeError("Invalid note name or note outside valid range.");return result},WebMidi.prototype._updateInputsAndOutputs=function(){this._updateInputs(),this._updateOutputs()},WebMidi.prototype._updateInputs=function(){for(var i=0;i<this._inputs.length;i++){for(var remove=!0,updated=this.interface.inputs.values(),input=updated.next();input&&!input.done;input=updated.next())if(this._inputs[i]._midiInput===input.value){remove=!1;break}remove&&this._inputs.splice(i,1)}this.interface&&this.interface.inputs.forEach(function(nInput){for(var add=!0,j=0;j<this._inputs.length;j++)this._inputs[j]._midiInput===nInput&&(add=!1);add&&this._inputs.push(new Input(nInput))}.bind(this))},WebMidi.prototype._updateOutputs=function(){for(var i=0;i<this._outputs.length;i++){for(var remove=!0,updated=this.interface.outputs.values(),output=updated.next();output&&!output.done;output=updated.next())if(this._outputs[i]._midiOutput===output.value){remove=!1;break}remove&&this._outputs.splice(i,1)}this.interface&&this.interface.outputs.forEach(function(nOutput){for(var add=!0,j=0;j<this._outputs.length;j++)this._outputs[j]._midiOutput===nOutput&&(add=!1);add&&this._outputs.push(new Output(nOutput))}.bind(this))},WebMidi.prototype._onInterfaceStateChange=function(e){this._updateInputsAndOutputs();var event={timestamp:e.timeStamp,type:e.port.state};this.interface&&"connected"===e.port.state?"output"===e.port.type?event.port=this.getOutputById(e.port.id):"input"===e.port.type&&(event.port=this.getInputById(e.port.id)):event.port={connection:"closed",id:e.port.id,manufacturer:e.port.manufacturer,name:e.port.name,state:e.port.state,type:e.port.type},this._userHandlers[e.port.state].forEach(function(handler){handler(event)})},WebMidi.prototype._resetInterfaceUserHandlers=function(){for(var i=0;i<this._midiInterfaceEvents.length;i++)this._userHandlers[this._midiInterfaceEvents[i]]=[]},Input.prototype.on=Input.prototype.addListener=function(type,channel,listener){var that=this;if(void 0===channel&&(channel="all"),Array.isArray(channel)||(channel=[channel]),channel.forEach(function(item){if("all"!==item&&!(1<=item&&item<=16))throw new RangeError("The 'channel' parameter is invalid.")}),"function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(void 0!==wm.MIDI_SYSTEM_MESSAGES[type])this._userHandlers.system[type]||(this._userHandlers.system[type]=[]),this._userHandlers.system[type].push(listener);else{if(void 0===wm.MIDI_CHANNEL_MESSAGES[type])throw new TypeError("The specified event type is not supported.");if(-1<channel.indexOf("all")){channel=[];for(var j=1;j<=16;j++)channel.push(j)}this._userHandlers.channel[type]||(this._userHandlers.channel[type]=[]),channel.forEach(function(ch){that._userHandlers.channel[type][ch]||(that._userHandlers.channel[type][ch]=[]),that._userHandlers.channel[type][ch].push(listener)})}return this},Input.prototype.hasListener=function(type,channel,listener){var that=this;if("function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(void 0===channel&&(channel="all"),channel.constructor!==Array&&(channel=[channel]),void 0!==wm.MIDI_SYSTEM_MESSAGES[type]){for(var o=0;o<this._userHandlers.system[type].length;o++)if(this._userHandlers.system[type][o]===listener)return!0}else if(void 0!==wm.MIDI_CHANNEL_MESSAGES[type]){if(-1<channel.indexOf("all")){channel=[];for(var j=1;j<=16;j++)channel.push(j)}return!!this._userHandlers.channel[type]&&channel.every(function(chNum){var listeners=that._userHandlers.channel[type][chNum];return listeners&&-1<listeners.indexOf(listener)})}return!1},Input.prototype.removeListener=function(type,channel,listener){var that=this;if(void 0!==listener&&"function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(void 0===channel&&(channel="all"),channel.constructor!==Array&&(channel=[channel]),void 0!==wm.MIDI_SYSTEM_MESSAGES[type])if(void 0===listener)this._userHandlers.system[type]=[];else for(var o=0;o<this._userHandlers.system[type].length;o++)this._userHandlers.system[type][o]===listener&&this._userHandlers.system[type].splice(o,1);else if(void 0!==wm.MIDI_CHANNEL_MESSAGES[type]){if(-1<channel.indexOf("all")){channel=[];for(var j=1;j<=16;j++)channel.push(j)}if(!this._userHandlers.channel[type])return this;channel.forEach(function(chNum){var listeners=that._userHandlers.channel[type][chNum];if(listeners)if(void 0===listener)that._userHandlers.channel[type][chNum]=[];else for(var l=0;l<listeners.length;l++)listeners[l]===listener&&listeners.splice(l,1)})}else{if(void 0!==type)throw new TypeError("The specified event type is not supported.");this._initializeUserHandlers()}return this},Input.prototype._initializeUserHandlers=function(){for(var prop1 in wm.MIDI_CHANNEL_MESSAGES)wm.MIDI_CHANNEL_MESSAGES.hasOwnProperty(prop1)&&(this._userHandlers.channel[prop1]={});for(var prop2 in wm.MIDI_SYSTEM_MESSAGES)wm.MIDI_SYSTEM_MESSAGES.hasOwnProperty(prop2)&&(this._userHandlers.system[prop2]=[])},Input.prototype._onMidiMessage=function(e){if(0<this._userHandlers.system.midimessage.length){var event={target:this,data:e.data,timestamp:e.timeStamp,type:"midimessage"};this._userHandlers.system.midimessage.forEach(function(callback){callback(event)})}e.data[0]<240?(this._parseChannelEvent(e),this._parseNrpnEvent(e)):e.data[0]<=255&&this._parseSystemEvent(e)},Input.prototype._parseNrpnEvent=function(e){var data1,data2,command=e.data[0]>>4,channelBufferIndex=15&e.data[0],channel=1+channelBufferIndex;if(1<e.data.length&&(data1=e.data[1],data2=2<e.data.length?e.data[2]:void 0),wm.nrpnEventsEnabled&&command===wm.MIDI_CHANNEL_MESSAGES.controlchange&&(data1>=wm.MIDI_NRPN_MESSAGES.increment&&data1<=wm.MIDI_NRPN_MESSAGES.parammsb||data1===wm.MIDI_NRPN_MESSAGES.entrymsb||data1===wm.MIDI_NRPN_MESSAGES.entrylsb)){var ccEvent={target:this,type:"controlchange",data:e.data,timestamp:e.timeStamp,channel:channel,controller:{number:data1,name:this.getCcNameByNumber(data1)},value:data2};if(ccEvent.controller.number===wm.MIDI_NRPN_MESSAGES.parammsb&&ccEvent.value!=wm.MIDI_NRPN_MESSAGES.nullactiveparameter)wm._nrpnBuffer[channelBufferIndex]=[],wm._nrpnBuffer[channelBufferIndex][0]=ccEvent;else if(1===wm._nrpnBuffer[channelBufferIndex].length&&ccEvent.controller.number===wm.MIDI_NRPN_MESSAGES.paramlsb)wm._nrpnBuffer[channelBufferIndex].push(ccEvent);else if(2!==wm._nrpnBuffer[channelBufferIndex].length||ccEvent.controller.number!==wm.MIDI_NRPN_MESSAGES.increment&&ccEvent.controller.number!==wm.MIDI_NRPN_MESSAGES.decrement&&ccEvent.controller.number!==wm.MIDI_NRPN_MESSAGES.entrymsb)if(3===wm._nrpnBuffer[channelBufferIndex].length&&wm._nrpnBuffer[channelBufferIndex][2].number===wm.MIDI_NRPN_MESSAGES.entrymsb&&ccEvent.controller.number===wm.MIDI_NRPN_MESSAGES.entrylsb)wm._nrpnBuffer[channelBufferIndex].push(ccEvent);else if(3<=wm._nrpnBuffer[channelBufferIndex].length&&wm._nrpnBuffer[channelBufferIndex].length<=4&&ccEvent.controller.number===wm.MIDI_NRPN_MESSAGES.parammsb&&ccEvent.value===wm.MIDI_NRPN_MESSAGES.nullactiveparameter)wm._nrpnBuffer[channelBufferIndex].push(ccEvent);else if(4<=wm._nrpnBuffer[channelBufferIndex].length&&wm._nrpnBuffer[channelBufferIndex].length<=5&&ccEvent.controller.number===wm.MIDI_NRPN_MESSAGES.paramlsb&&ccEvent.value===wm.MIDI_NRPN_MESSAGES.nullactiveparameter){wm._nrpnBuffer[channelBufferIndex].push(ccEvent);var rawData=[];wm._nrpnBuffer[channelBufferIndex].forEach(function(ev){rawData.push(ev.data)});var nrpnNumber=wm._nrpnBuffer[channelBufferIndex][0].value<<7|wm._nrpnBuffer[channelBufferIndex][1].value,nrpnValue=wm._nrpnBuffer[channelBufferIndex][2].value;6===wm._nrpnBuffer[channelBufferIndex].length&&(nrpnValue=wm._nrpnBuffer[channelBufferIndex][2].value<<7|wm._nrpnBuffer[channelBufferIndex][3].value);var nrpnControllerType="";switch(wm._nrpnBuffer[channelBufferIndex][2].controller.number){case wm.MIDI_NRPN_MESSAGES.entrymsb:nrpnControllerType=wm._nrpnTypes[0];break;case wm.MIDI_NRPN_MESSAGES.increment:nrpnControllerType=wm._nrpnTypes[1];break;case wm.MIDI_NRPN_MESSAGES.decrement:nrpnControllerType=wm._nrpnTypes[2];break;default:throw new Error("The NPRN type was unidentifiable.")}var nrpnEvent={timestamp:ccEvent.timestamp,channel:ccEvent.channel,type:"nrpn",data:rawData,controller:{number:nrpnNumber,type:nrpnControllerType,name:"Non-Registered Parameter "+nrpnNumber},value:nrpnValue};wm._nrpnBuffer[channelBufferIndex]=[],this._userHandlers.channel[nrpnEvent.type]&&this._userHandlers.channel[nrpnEvent.type][nrpnEvent.channel]&&this._userHandlers.channel[nrpnEvent.type][nrpnEvent.channel].forEach(function(callback){callback(nrpnEvent)})}else wm._nrpnBuffer[channelBufferIndex]=[];else wm._nrpnBuffer[channelBufferIndex].push(ccEvent)}},Input.prototype._parseChannelEvent=function(e){var data1,data2,command=e.data[0]>>4,channel=1+(15&e.data[0]);1<e.data.length&&(data1=e.data[1],data2=2<e.data.length?e.data[2]:void 0);var event={target:this,data:e.data,timestamp:e.timeStamp,channel:channel};command===wm.MIDI_CHANNEL_MESSAGES.noteoff||command===wm.MIDI_CHANNEL_MESSAGES.noteon&&0===data2?(event.type="noteoff",event.note={number:data1,name:wm._notes[data1%12],octave:wm.getOctave(data1)},event.velocity=data2/127,event.rawVelocity=data2):command===wm.MIDI_CHANNEL_MESSAGES.noteon?(event.type="noteon",event.note={number:data1,name:wm._notes[data1%12],octave:wm.getOctave(data1)},event.velocity=data2/127,event.rawVelocity=data2):command===wm.MIDI_CHANNEL_MESSAGES.keyaftertouch?(event.type="keyaftertouch",event.note={number:data1,name:wm._notes[data1%12],octave:wm.getOctave(data1)},event.value=data2/127):command===wm.MIDI_CHANNEL_MESSAGES.controlchange&&0<=data1&&data1<=119?(event.type="controlchange",event.controller={number:data1,name:this.getCcNameByNumber(data1)},event.value=data2):command===wm.MIDI_CHANNEL_MESSAGES.channelmode&&120<=data1&&data1<=127?(event.type="channelmode",event.controller={number:data1,name:this.getChannelModeByNumber(data1)},event.value=data2):command===wm.MIDI_CHANNEL_MESSAGES.programchange?(event.type="programchange",event.value=data1):command===wm.MIDI_CHANNEL_MESSAGES.channelaftertouch?(event.type="channelaftertouch",event.value=data1/127):command===wm.MIDI_CHANNEL_MESSAGES.pitchbend?(event.type="pitchbend",event.value=((data2<<7)+data1-8192)/8192):event.type="unknownchannelmessage",this._userHandlers.channel[event.type]&&this._userHandlers.channel[event.type][channel]&&this._userHandlers.channel[event.type][channel].forEach(function(callback){callback(event)})},Input.prototype.getCcNameByNumber=function(number){if(!(0<=(number=Math.floor(number))&&number<=119))throw new RangeError("The control change number must be between 0 and 119.");for(var cc in wm.MIDI_CONTROL_CHANGE_MESSAGES)if(wm.MIDI_CONTROL_CHANGE_MESSAGES.hasOwnProperty(cc)&&number===wm.MIDI_CONTROL_CHANGE_MESSAGES[cc])return cc},Input.prototype.getChannelModeByNumber=function(number){if(!(120<=(number=Math.floor(number))&&status<=127))throw new RangeError("The control change number must be between 120 and 127.");for(var cm in wm.MIDI_CHANNEL_MODE_MESSAGES)if(wm.MIDI_CHANNEL_MODE_MESSAGES.hasOwnProperty(cm)&&number===wm.MIDI_CHANNEL_MODE_MESSAGES[cm])return cm},Input.prototype._parseSystemEvent=function(e){var command=e.data[0],event={target:this,data:e.data,timestamp:e.timeStamp};command===wm.MIDI_SYSTEM_MESSAGES.sysex?event.type="sysex":command===wm.MIDI_SYSTEM_MESSAGES.timecode?event.type="timecode":command===wm.MIDI_SYSTEM_MESSAGES.songposition?event.type="songposition":command===wm.MIDI_SYSTEM_MESSAGES.songselect?(event.type="songselect",event.song=e.data[1]):command===wm.MIDI_SYSTEM_MESSAGES.tuningrequest?event.type="tuningrequest":command===wm.MIDI_SYSTEM_MESSAGES.clock?event.type="clock":command===wm.MIDI_SYSTEM_MESSAGES.start?event.type="start":command===wm.MIDI_SYSTEM_MESSAGES.continue?event.type="continue":command===wm.MIDI_SYSTEM_MESSAGES.stop?event.type="stop":command===wm.MIDI_SYSTEM_MESSAGES.activesensing?event.type="activesensing":command===wm.MIDI_SYSTEM_MESSAGES.reset?event.type="reset":event.type="unknownsystemmessage",this._userHandlers.system[event.type]&&this._userHandlers.system[event.type].forEach(function(callback){callback(event)})},Output.prototype.send=function(status,data,timestamp){if(!(128<=status&&status<=255))throw new RangeError("The status byte must be an integer between 128 (0x80) and 255 (0xFF).");void 0===data&&(data=[]),Array.isArray(data)||(data=[data]);var message=[];return data.forEach(function(item){var parsed=Math.floor(item);if(!(0<=parsed&&parsed<=255))throw new RangeError("Data bytes must be integers between 0 (0x00) and 255 (0xFF).");message.push(parsed)}),this._midiOutput.send([status].concat(message),parseFloat(timestamp)||0),this},Output.prototype.sendSysex=function(manufacturer,data,options){if(!wm.sysexEnabled)throw new Error("Sysex message support must first be activated.");return options=options||{},manufacturer=[].concat(manufacturer),data.forEach(function(item){if(item<0||127<item)throw new RangeError("The data bytes of a sysex message must be integers between 0 (0x00) and 127 (0x7F).")}),data=manufacturer.concat(data,wm.MIDI_SYSTEM_MESSAGES.sysexend),this.send(wm.MIDI_SYSTEM_MESSAGES.sysex,data,this._parseTimeParameter(options.time)),this},Output.prototype.sendTimecodeQuarterFrame=function(value,options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.timecode,value,this._parseTimeParameter(options.time)),this},Output.prototype.sendSongPosition=function(value,options){options=options||{};var msb=(value=Math.floor(value)||0)>>7&127,lsb=127&value;return this.send(wm.MIDI_SYSTEM_MESSAGES.songposition,[msb,lsb],this._parseTimeParameter(options.time)),this},Output.prototype.sendSongSelect=function(value,options){if(options=options||{},!(0<=(value=Math.floor(value))&&value<=127))throw new RangeError("The song number must be between 0 and 127.");return this.send(wm.MIDI_SYSTEM_MESSAGES.songselect,[value],this._parseTimeParameter(options.time)),this},Output.prototype.sendTuningRequest=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.tuningrequest,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.sendClock=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.clock,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.sendStart=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.start,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.sendContinue=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.continue,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.sendStop=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.stop,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.sendActiveSensing=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.activesensing,[],this._parseTimeParameter(options.time)),this},Output.prototype.sendReset=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.reset,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.stopNote=function(note,channel,options){if("all"===note)return this.sendChannelMode("allnotesoff",0,channel,options);var nVelocity=64;return(options=options||{}).rawVelocity?!isNaN(options.velocity)&&0<=options.velocity&&options.velocity<=127&&(nVelocity=options.velocity):!isNaN(options.velocity)&&0<=options.velocity&&options.velocity<=1&&(nVelocity=127*options.velocity),this._convertNoteToArray(note).forEach(function(item){wm.toMIDIChannels(channel).forEach(function(ch){this.send((wm.MIDI_CHANNEL_MESSAGES.noteoff<<4)+(ch-1),[item,Math.round(nVelocity)],this._parseTimeParameter(options.time))}.bind(this))}.bind(this)),this},Output.prototype.playNote=function(note,channel,options){var time,nVelocity=64;if((options=options||{}).rawVelocity?!isNaN(options.velocity)&&0<=options.velocity&&options.velocity<=127&&(nVelocity=options.velocity):!isNaN(options.velocity)&&0<=options.velocity&&options.velocity<=1&&(nVelocity=127*options.velocity),time=this._parseTimeParameter(options.time),this._convertNoteToArray(note).forEach(function(item){wm.toMIDIChannels(channel).forEach(function(ch){this.send((wm.MIDI_CHANNEL_MESSAGES.noteon<<4)+(ch-1),[item,Math.round(nVelocity)],time)}.bind(this))}.bind(this)),!isNaN(options.duration)){options.duration<=0&&(options.duration=0);var nRelease=64;options.rawVelocity?!isNaN(options.release)&&0<=options.release&&options.release<=127&&(nRelease=options.release):!isNaN(options.release)&&0<=options.release&&options.release<=1&&(nRelease=127*options.release),this._convertNoteToArray(note).forEach(function(item){wm.toMIDIChannels(channel).forEach(function(ch){this.send((wm.MIDI_CHANNEL_MESSAGES.noteoff<<4)+(ch-1),[item,Math.round(nRelease)],(time||wm.time)+options.duration)}.bind(this))}.bind(this))}return this},Output.prototype.sendKeyAftertouch=function(note,channel,pressure,options){var that=this;if(options=options||{},channel<1||16<channel)throw new RangeError("The channel must be between 1 and 16.");(isNaN(pressure)||pressure<0||1<pressure)&&(pressure=.5);var nPressure=Math.round(127*pressure);return this._convertNoteToArray(note).forEach(function(item){wm.toMIDIChannels(channel).forEach(function(ch){that.send((wm.MIDI_CHANNEL_MESSAGES.keyaftertouch<<4)+(ch-1),[item,nPressure],that._parseTimeParameter(options.time))})}),this},Output.prototype.sendControlChange=function(controller,value,channel,options){if(options=options||{},"string"==typeof controller){if(void 0===(controller=wm.MIDI_CONTROL_CHANGE_MESSAGES[controller]))throw new TypeError("Invalid controller name.")}else if(!(0<=(controller=Math.floor(controller))&&controller<=119))throw new RangeError("Controller numbers must be between 0 and 119.");if(!(0<=(value=Math.floor(value)||0)&&value<=127))throw new RangeError("Controller value must be between 0 and 127.");return wm.toMIDIChannels(channel).forEach(function(ch){this.send((wm.MIDI_CHANNEL_MESSAGES.controlchange<<4)+(ch-1),[controller,value],this._parseTimeParameter(options.time))}.bind(this)),this},Output.prototype._selectRegisteredParameter=function(parameter,channel,time){var that=this;if(parameter[0]=Math.floor(parameter[0]),!(0<=parameter[0]&&parameter[0]<=127))throw new RangeError("The control65 value must be between 0 and 127");if(parameter[1]=Math.floor(parameter[1]),!(0<=parameter[1]&&parameter[1]<=127))throw new RangeError("The control64 value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.sendControlChange(101,parameter[0],channel,{time:time}),that.sendControlChange(100,parameter[1],channel,{time:time})}),this},Output.prototype._selectNonRegisteredParameter=function(parameter,channel,time){var that=this;if(parameter[0]=Math.floor(parameter[0]),!(0<=parameter[0]&&parameter[0]<=127))throw new RangeError("The control63 value must be between 0 and 127");if(parameter[1]=Math.floor(parameter[1]),!(0<=parameter[1]&&parameter[1]<=127))throw new RangeError("The control62 value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.sendControlChange(99,parameter[0],channel,{time:time}),that.sendControlChange(98,parameter[1],channel,{time:time})}),this},Output.prototype._setCurrentRegisteredParameter=function(data,channel,time){var that=this;if((data=[].concat(data))[0]=Math.floor(data[0]),!(0<=data[0]&&data[0]<=127))throw new RangeError("The msb value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.sendControlChange(6,data[0],channel,{time:time})}),data[1]=Math.floor(data[1]),0<=data[1]&&data[1]<=127&&wm.toMIDIChannels(channel).forEach(function(){that.sendControlChange(38,data[1],channel,{time:time})}),this},Output.prototype._deselectRegisteredParameter=function(channel,time){var that=this;return wm.toMIDIChannels(channel).forEach(function(){that.sendControlChange(101,127,channel,{time:time}),that.sendControlChange(100,127,channel,{time:time})}),this},Output.prototype.setRegisteredParameter=function(parameter,data,channel,options){var that=this;if(options=options||{},!Array.isArray(parameter)){if(!wm.MIDI_REGISTERED_PARAMETER[parameter])throw new Error("The specified parameter is not available.");parameter=wm.MIDI_REGISTERED_PARAMETER[parameter]}return wm.toMIDIChannels(channel).forEach(function(){that._selectRegisteredParameter(parameter,channel,options.time),that._setCurrentRegisteredParameter(data,channel,options.time),that._deselectRegisteredParameter(channel,options.time)}),this},Output.prototype.setNonRegisteredParameter=function(parameter,data,channel,options){var that=this;if(options=options||{},!(0<=parameter[0]&&parameter[0]<=127&&0<=parameter[1]&&parameter[1]<=127))throw new Error("Position 0 and 1 of the 2-position parameter array must both be between 0 and 127.");return data=[].concat(data),wm.toMIDIChannels(channel).forEach(function(){that._selectNonRegisteredParameter(parameter,channel,options.time),that._setCurrentRegisteredParameter(data,channel,options.time),that._deselectRegisteredParameter(channel,options.time)}),this},Output.prototype.incrementRegisteredParameter=function(parameter,channel,options){var that=this;if(options=options||{},!Array.isArray(parameter)){if(!wm.MIDI_REGISTERED_PARAMETER[parameter])throw new Error("The specified parameter is not available.");parameter=wm.MIDI_REGISTERED_PARAMETER[parameter]}return wm.toMIDIChannels(channel).forEach(function(){that._selectRegisteredParameter(parameter,channel,options.time),that.sendControlChange(96,0,channel,{time:options.time}),that._deselectRegisteredParameter(channel,options.time)}),this},Output.prototype.decrementRegisteredParameter=function(parameter,channel,options){if(options=options||{},!Array.isArray(parameter)){if(!wm.MIDI_REGISTERED_PARAMETER[parameter])throw new TypeError("The specified parameter is not available.");parameter=wm.MIDI_REGISTERED_PARAMETER[parameter]}return wm.toMIDIChannels(channel).forEach(function(){this._selectRegisteredParameter(parameter,channel,options.time),this.sendControlChange(97,0,channel,{time:options.time}),this._deselectRegisteredParameter(channel,options.time)}.bind(this)),this},Output.prototype.setPitchBendRange=function(semitones,cents,channel,options){var that=this;if(options=options||{},!(0<=(semitones=Math.floor(semitones)||0)&&semitones<=127))throw new RangeError("The semitones value must be between 0 and 127");if(!(0<=(cents=Math.floor(cents)||0)&&cents<=127))throw new RangeError("The cents value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.setRegisteredParameter("pitchbendrange",[semitones,cents],channel,{time:options.time})}),this},Output.prototype.setModulationRange=function(semitones,cents,channel,options){var that=this;if(options=options||{},!(0<=(semitones=Math.floor(semitones)||0)&&semitones<=127))throw new RangeError("The semitones value must be between 0 and 127");if(!(0<=(cents=Math.floor(cents)||0)&&cents<=127))throw new RangeError("The cents value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.setRegisteredParameter("modulationrange",[semitones,cents],channel,{time:options.time})}),this},Output.prototype.setMasterTuning=function(value,channel,options){var that=this;if(options=options||{},(value=parseFloat(value)||0)<=-65||64<=value)throw new RangeError("The value must be a decimal number larger than -65 and smaller than 64.");var coarse=Math.floor(value)+64,fine=value-Math.floor(value),msb=(fine=Math.round((fine+1)/2*16383))>>7&127,lsb=127&fine;return wm.toMIDIChannels(channel).forEach(function(){that.setRegisteredParameter("channelcoarsetuning",coarse,channel,{time:options.time}),that.setRegisteredParameter("channelfinetuning",[msb,lsb],channel,{time:options.time})}),this},Output.prototype.setTuningProgram=function(value,channel,options){var that=this;if(options=options||{},!(0<=(value=Math.floor(value))&&value<=127))throw new RangeError("The program value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.setRegisteredParameter("tuningprogram",value,channel,{time:options.time})}),this},Output.prototype.setTuningBank=function(value,channel,options){var that=this;if(options=options||{},!(0<=(value=Math.floor(value)||0)&&value<=127))throw new RangeError("The bank value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.setRegisteredParameter("tuningbank",value,channel,{time:options.time})}),this},Output.prototype.sendChannelMode=function(command,value,channel,options){if(options=options||{},"string"==typeof command){if(!(command=wm.MIDI_CHANNEL_MODE_MESSAGES[command]))throw new TypeError("Invalid channel mode message name.")}else if(!(120<=(command=Math.floor(command))&&command<=127))throw new RangeError("Channel mode numerical identifiers must be between 120 and 127.");if((value=Math.floor(value)||0)<0||127<value)throw new RangeError("Value must be an integer between 0 and 127.");return wm.toMIDIChannels(channel).forEach(function(ch){this.send((wm.MIDI_CHANNEL_MESSAGES.channelmode<<4)+(ch-1),[command,value],this._parseTimeParameter(options.time))}.bind(this)),this},Output.prototype.sendProgramChange=function(program,channel,options){var that=this;if(options=options||{},program=Math.floor(program),isNaN(program)||program<0||127<program)throw new RangeError("Program numbers must be between 0 and 127.");return wm.toMIDIChannels(channel).forEach(function(ch){that.send((wm.MIDI_CHANNEL_MESSAGES.programchange<<4)+(ch-1),[program],that._parseTimeParameter(options.time))}),this},Output.prototype.sendChannelAftertouch=function(pressure,channel,options){var that=this;options=options||{},pressure=parseFloat(pressure),(isNaN(pressure)||pressure<0||1<pressure)&&(pressure=.5);var nPressure=Math.round(127*pressure);return wm.toMIDIChannels(channel).forEach(function(ch){that.send((wm.MIDI_CHANNEL_MESSAGES.channelaftertouch<<4)+(ch-1),[nPressure],that._parseTimeParameter(options.time))}),this},Output.prototype.sendPitchBend=function(bend,channel,options){var that=this;if(options=options||{},isNaN(bend)||bend<-1||1<bend)throw new RangeError("Pitch bend value must be between -1 and 1.");var nLevel=Math.round((bend+1)/2*16383),msb=nLevel>>7&127,lsb=127&nLevel;return wm.toMIDIChannels(channel).forEach(function(ch){that.send((wm.MIDI_CHANNEL_MESSAGES.pitchbend<<4)+(ch-1),[lsb,msb],that._parseTimeParameter(options.time))}),this},Output.prototype._parseTimeParameter=function(time){var value,parsed=parseFloat(time);return"string"==typeof time&&"+"===time.substring(0,1)?parsed&&0<parsed&&(value=wm.time+parsed):parsed>wm.time&&(value=parsed),value},Output.prototype._convertNoteToArray=function(note){var notes=[];return Array.isArray(note)||(note=[note]),note.forEach(function(item){notes.push(wm.guessNoteNumber(item))}),notes},"function"==typeof define&&"object"==typeof define.amd?define([],function(){return wm}):"undefined"!=typeof module&&module.exports?module.exports=wm:scope.WebMidi||(scope.WebMidi=wm)}(this);
},{}]},{},[1]);
