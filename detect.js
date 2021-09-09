require=(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
//const p = require("@tonaljs/pcset")
const c = require("@tonaljs/chord")
const m = require("@tonaljs/midi")
const { Interval } = require("@tonaljs/tonal");
const WebMidi = require("webmidi");

const Cookies = require('js-cookie');

var device = null;
var emc_channel = 0;
var last_emc_note = 0;
var last_emc_shape = 0;
var last_emc_color = 0;
var offline_mode = false;

function sendShapeColor(note, shape, color, velocity, channel) {
//    console.log(`Sending Note:${note}, Shape:${shape}, Color:${color}, Velocity:${velocity} on Channel ${channel}`);
    last_emc_note = note;
    last_emc_shape = shape;
    last_emc_color = color;
    if(device){
        device
        .sendControlChange(16,color, channel)
        .sendControlChange(17,shape,channel)
        .playNote(note, channel, { velocity:velocity });
//    device.playNote(note, channel).sendControlChange(17,shape).sendControlChange(16,color);
    }
}

function sendOff(channel) {
    if(last_emc_note && device){
        const n = current_notes.filter(Boolean).length ;
        if(n==0){
//            console.log(`Sending Note Off:${last_emc_note}`);
            device.stopNote(last_emc_note, channel)
        }
    }
}

function sendShape() {
    if(device && emc_channel && last_emc_shape) device.sendControlChange(17,last_emc_shape,emc_channel);
}

function sendNote() {
    if(device && emc_channel && last_emc_note)
        device.playNote(last_emc_note, emc_channel, { duration:660 });
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
            $('.supported').hide();
            offline_mode = true;
            return false;
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

function playNote(note){
//    console.log(note);
/*
    const n = current_notes.filter(Boolean).length ;
    if(n>3)return; // M:C max polyphony is 4..
*/

    current_notes[note] = true;
    current_notes_velocity[note] = 0.5;
    playedChord(true);
}

function stopNote(note){
//    console.log(note);
    current_notes[note] = false;
    current_notes_velocity[note] = 0.0;
    playedChord(false);
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
                playNote(event.note.number);
            })
            input.addListener('noteoff', "all", function (event) {
                stopNote(event.note.number);
                if(emc_channel)
                    sendOff(emc_channel);
            })            
            console.log('Found MIDI input device: ', input.name);
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
    offline_mode = false;

    const stored_channel = Cookies.get('emcc midi ch');
    if(stored_channel){
        console.log('Restoring MIDI channel ' + stored_channel);
        emc_channel = parseInt(stored_channel);
        $(document).trigger('emccc:midich',[ emc_channel ]);
    }

    console.log('Connection established');
}

function onDisconnect() {
    device = null;
    offline_mode = true;

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
    if(s[1]=='b' || s[1]=='#') return s.substring(0,2);
    return s[0];
}

function soloTipo(s) {
    if(s[1]=='b' || s[1]=='#') return s.substring(2);
    return s.substring(1);
}

function tonicaToString(s) {
    return s.slice(0,-1) + ((s[1]=='b' || s[1]=='#') ? "":"-") + (parseInt(s.slice(-1))+1) // trick
}


function processChord(cname, chord, velocity, send) {
    // convert to base + rivolto
    const base = cname.split('/')[0];
    const baseSoloNota = soloNota(base);
    var rivolto;
    if(!cname.includes('/')){
        rivolto = 0;
    } else {
        switch(chord.length){
            case 3: 
                rivolto = soloNota(chord[1])==baseSoloNota ? 2 : 1; 
                break;
            case 4: rivolto = soloNota(chord[3])==baseSoloNota ? 1 : 
                (soloNota(chord[2])==baseSoloNota ? 2 : 3); 
                break;
            default: rivolto = 0; break;
        }
    }

    // convert chord to EMC engine shape
    if(send || offline_mode){
        const chordType = soloTipo(base);
        const shape = shapeMap[chordType];
        const color = rivolto==0 ? 32 : (rivolto==1 ? 62 : (rivolto == 2 ? 74 : 84));
        var tonica = soloNota(chord[0])==baseSoloNota ? chord[0] : 
            (soloNota(chord[1])==baseSoloNota ? chord[1] :
                (soloNota(chord[2])==baseSoloNota ? chord[2] : chord[3]));

        const tonicaCode = m.toMidi(tonica);

        if((emc_channel||offline_mode) && shape && color && tonicaCode){
            const payload = {
                "chord":cname,
                "shape":shape,
                "color":color,
                "tonica":tonicaToString(tonica),
                "n":chord.length,
                "notes":chord
            };
//            console.log(payload);
            if(!offline_mode)
                sendShapeColor(tonicaCode, shape-1, color, velocity, emc_channel);
            $(document).trigger('emccc:chord',[ cname, payload ]);
            return true;
        }
    }

    if(offline_mode)
        $(document).trigger('emccc:chord',[ cname, { "chord":cname, "notes":chord } ]);
    return false;
}

function playedChord(send) {
    let n = current_notes.filter(Boolean).length ;

    var chord = [];
    var velocity = 0;
    for(var i=0; i<current_notes.length; i++){
        if(current_notes[i]){
            if(velocity==0) velocity = current_notes_velocity[i];
            chord.push(m.midiToNoteName(i, { sharps: true }));
        }
    }
//    console.log(current_notes.filter(Boolean));

    /*
    // remove unisons (prefer lower note: arbitrary criteria)
    chord = chord.filter((n,i) => { 
        const name = soloNota(n);
        const has_lower_unison = chord.some( (v,j) => {
            if(i==j)return false;
            const inner_name = soloNota(v);
            return inner_name === name && v<n; 
        });
        return !has_lower_unison;
    });
//    console.log(chord);
    n=chord.length;
    */

    if(n>2){
        const name = c.detect(chord);
        if(name.length>0){

            let found = false;
            for (let i=0; i<name.length; i++){
                if(processChord(name[i], chord, velocity, send)){
                    found = true;
                    break;
                }
            }
        }
    } else if (n==1) {
        var note = 0;
        for(var i=0; i<current_notes.length; i++){
            if(current_notes[i]){
                note = m.midiToNoteName(i, { sharps: true });
                break;
            }
        }
        const cname = soloNota(note);

        if(send || offline_mode){
            const shape = 1;
            const color = 0; 
            var tonica = note;
            const tonicaCode = m.toMidi(tonica);
    
            if(emc_channel || offline_mode){
                if(!offline_mode)
                    sendShapeColor(tonicaCode, shape-1, color, velocity, emc_channel);
                $(document).trigger('emccc:chord',[ cname, {
                    "chord":cname,
                    "shape":shape,
                    "color":color,
                    "tonica":tonicaToString(tonica),
                    "n":n,
                    "notes":chord
                } ]);
                return;
            }
        }
        //(document).trigger('emccc:chord',[ cname, { "chord":cname, "notes":[ note ] } ]);
        return;
    } else if (n==2) {
        //  Trick by Elektron: for two notes chord, use color=10 (first two notes of chord are doubled)
        var interval = Interval.distance(chord[0],chord[1]);
        interval = Interval.simplify(interval);
        const semitones = Interval.semitones(interval);
        var color, shape, tonica=chord[0];
        switch(semitones){
            case 1: color = 10; shape = 31; break; // minor second from sus4#5b9
            case 2: color = 10; shape = 6; break; // major second from sus2
            case 3: color = 10; shape = 4; break; // minor third from m
            case 4: color = 10; shape = 5; break; // major third from M
            case 5: color = 10; shape = 7; break; // perfect four from sus4
            case 6: color = 37; shape = 19; break; // tritone from b5 (first and third note)
            case 7: color = 10; shape = 38; break; // perfect fifth from fifth chord
            case 8: color = 37; shape = 22; break; // sixth minor from #5 (first and third note)

            //case 9: color = 37; shape = 35; break; // sixth major from Maj7/6no5 (first and third note)
            //case 10: color = 37; shape = 27; break; // seventh minor from M9no5 (first and third note)
            //case 11: color = 37; shape = 36; break; // seventh major from Maj9no5 (first and third note)
            default: color = 0; shape = 1; tonica=null; break; // revert to single note on boh
        }
        const cname = soloNota(chord[0]) + "-" + soloNota(chord[1]);
        if(tonica && ((send && emc_channel) || offline_mode)){
            if(!offline_mode){
                const tonicaCode = m.toMidi(tonica);
                sendShapeColor(tonicaCode, shape-1, color, velocity, emc_channel);
            }
            $(document).trigger('emccc:chord',[ cname, {
                "chord":cname,
                "shape":shape,
                "color":color,
                "tonica":tonicaToString(tonica),
                "n":n,
                "notes":chord
            } ]);
        }
        return;
    }
//    $(document).trigger('emccc:chord'); // undef chord
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
• sus4add#5 
• Maddb5
• M6add4no5 
• Maj7/6no5
• Maj9no5
• Fourths
• Fifths
*/

if (typeof window !== 'undefined') {
    window.SetEMCChannel = function(s) {
        emc_channel = s;
        Cookies.set('emcc midi ch', emc_channel);
    }
    window.midi = function(s) {
        return m.midiToNoteName(s);
    }
    window.enableWebMidi = function() {
        return enableWebMidi();
    }
    window.playNote = function(s) {
        return playNote(s);
    }
    window.stopNote = function(s) {
        return stopNote(s);
    }
    window.SetOfflineMode = function(m) {
        offline_mode = m;
    }
    window.sendShape = function() {
        sendShape();
    }
    window.sendNote = function() {
        sendNote();
    }
}

},{"@tonaljs/chord":6,"@tonaljs/midi":12,"@tonaljs/tonal":22,"js-cookie":23,"webmidi":24}],2:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core'], factory) :
  (global = global || self, factory(global.AbcNotation = {}, global.core));
}(this, (function (exports, core) { 'use strict';

  var fillStr = function (character, times) {
      return Array(times + 1).join(character);
  };
  var REGEX = /^(_{1,}|=|\^{1,}|)([abcdefgABCDEFG])([,']*)$/;
  function tokenize(str) {
      var m = REGEX.exec(str);
      if (!m) {
          return ["", "", ""];
      }
      return [m[1], m[2], m[3]];
  }
  /**
   * Convert a (string) note in ABC notation into a (string) note in scientific notation
   *
   * @example
   * abcToScientificNotation("c") // => "C5"
   */
  function abcToScientificNotation(str) {
      var _a = tokenize(str), acc = _a[0], letter = _a[1], oct = _a[2];
      if (letter === "") {
          return "";
      }
      var o = 4;
      for (var i = 0; i < oct.length; i++) {
          o += oct.charAt(i) === "," ? -1 : 1;
      }
      var a = acc[0] === "_"
          ? acc.replace(/_/g, "b")
          : acc[0] === "^"
              ? acc.replace(/\^/g, "#")
              : "";
      return letter.charCodeAt(0) > 96
          ? letter.toUpperCase() + a + (o + 1)
          : letter + a + o;
  }
  /**
   * Convert a (string) note in scientific notation into a (string) note in ABC notation
   *
   * @example
   * scientificToAbcNotation("C#4") // => "^C"
   */
  function scientificToAbcNotation(str) {
      var n = core.note(str);
      if (n.empty || !n.oct) {
          return "";
      }
      var letter = n.letter, acc = n.acc, oct = n.oct;
      var a = acc[0] === "b" ? acc.replace(/b/g, "_") : acc.replace(/#/g, "^");
      var l = oct > 4 ? letter.toLowerCase() : letter;
      var o = oct === 5 ? "" : oct > 4 ? fillStr("'", oct - 5) : fillStr(",", 4 - oct);
      return a + l + o;
  }
  function transpose(note, interval) {
      return scientificToAbcNotation(core.transpose(abcToScientificNotation(note), interval));
  }
  function distance(from, to) {
      return core.distance(abcToScientificNotation(from), abcToScientificNotation(to));
  }
  var index = {
      abcToScientificNotation: abcToScientificNotation,
      scientificToAbcNotation: scientificToAbcNotation,
      tokenize: tokenize,
      transpose: transpose,
      distance: distance,
  };

  exports.abcToScientificNotation = abcToScientificNotation;
  exports.default = index;
  exports.distance = distance;
  exports.scientificToAbcNotation = scientificToAbcNotation;
  exports.tokenize = tokenize;
  exports.transpose = transpose;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/core":8}],3:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core'], factory) :
  (global = global || self, factory(global.Array = {}, global.core));
}(this, (function (exports, core) { 'use strict';

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
   * @param {Array} array
   * @return {Array} the rotated array
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
   * Return a copy of the array with the null values removed
   * @function
   * @param {Array} array
   * @return {Array}
   *
   * @example
   * compact(["a", "b", null, "c"]) // => ["a", "b", "c"]
   */
  function compact(arr) {
      return arr.filter(function (n) { return n === 0 || n; });
  }
  /**
   * Sort an array of notes in ascending order. Pitch classes are listed
   * before notes. Any string that is not a note is removed.
   *
   * @param {string[]} notes
   * @return {string[]} sorted array of notes
   *
   * @example
   * sortedNoteNames(['c2', 'c5', 'c1', 'c0', 'c6', 'c'])
   * // => ['C', 'C0', 'C1', 'C2', 'C5', 'C6']
   * sortedNoteNames(['c', 'F', 'G', 'a', 'b', 'h', 'J'])
   * // => ['C', 'F', 'G', 'A', 'B']
   */
  function sortedNoteNames(notes) {
      var valid = notes.map(function (n) { return core.note(n); }).filter(function (n) { return !n.empty; });
      return valid.sort(function (a, b) { return a.height - b.height; }).map(function (n) { return n.name; });
  }
  /**
   * Get sorted notes with duplicates removed. Pitch classes are listed
   * before notes.
   *
   * @function
   * @param {string[]} array
   * @return {string[]} unique sorted notes
   *
   * @example
   * Array.sortedUniqNoteNames(['a', 'b', 'c2', '1p', 'p2', 'c2', 'b', 'c', 'c3' ])
   * // => [ 'C', 'A', 'B', 'C2', 'C3' ]
   */
  function sortedUniqNoteNames(arr) {
      return sortedNoteNames(arr).filter(function (n, i, a) { return i === 0 || n !== a[i - 1]; });
  }
  /**
   * Randomizes the order of the specified array in-place, using the Fisher–Yates shuffle.
   *
   * @function
   * @param {Array} array
   * @return {Array} the array shuffled
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
   * Get all permutations of an array
   *
   * @param {Array} array - the array
   * @return {Array<Array>} an array with all the permutations
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

  exports.compact = compact;
  exports.permutations = permutations;
  exports.range = range;
  exports.rotate = rotate;
  exports.shuffle = shuffle;
  exports.sortedNoteNames = sortedNoteNames;
  exports.sortedUniqNoteNames = sortedUniqNoteNames;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/core":8}],4:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/chord-type'), require('@tonaljs/core'), require('@tonaljs/pcset')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/chord-type', '@tonaljs/core', '@tonaljs/pcset'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ChordDetect = {}, global.chordType, global.core, global.pcset));
}(this, (function (exports, chordType, core, pcset) { 'use strict';

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
      // we need to test all chormas to get the correct baseNote
      var allModes = pcset.modes(notes, false);
      var found = [];
      allModes.forEach(function (mode, index) {
          // some chords could have the same chroma but different interval spelling
          var chordTypes = chordType.all().filter(function (chordType) { return chordType.chroma === mode; });
          chordTypes.forEach(function (chordType) {
              var chordName = chordType.aliases[0];
              var baseNote = noteName(index);
              var isInversion = index !== tonicChroma;
              if (isInversion) {
                  found.push({
                      weight: 0.5 * weight,
                      name: "" + baseNote + chordName + "/" + tonic,
                  });
              }
              else {
                  found.push({ weight: 1 * weight, name: "" + baseNote + chordName });
              }
          });
      });
      return found;
  }
  var index = { detect: detect };

  exports.default = index;
  exports.detect = detect;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/chord-type":5,"@tonaljs/core":8,"@tonaljs/pcset":15}],5:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core'), require('@tonaljs/pcset')) :
    typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core', '@tonaljs/pcset'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ChordType = {}, global.core, global.pcset));
}(this, (function (exports, core, pcset) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
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
        ["1P 3M 5P", "major", "M ^ "],
        ["1P 3M 5P 7M", "major seventh", "maj7 Δ ma7 M7 Maj7 ^7"],
        ["1P 3M 5P 7M 9M", "major ninth", "maj9 Δ9 ^9"],
        ["1P 3M 5P 7M 9M 13M", "major thirteenth", "maj13 Maj13 ^13"],
        ["1P 3M 5P 6M", "sixth", "6 add6 add13 M6"],
        ["1P 3M 5P 6M 9M", "sixth/ninth", "6/9 69 M69"],
        ["1P 3M 6m 7M", "major seventh flat sixth", "M7b6 ^7b6"],
        [
            "1P 3M 5P 7M 11A",
            "major seventh sharp eleventh",
            "maj#4 Δ#4 Δ#11 M7#11 ^7#11 maj7#11",
        ],
        // ==Minor==
        // '''Normal'''
        ["1P 3m 5P", "minor", "m min -"],
        ["1P 3m 5P 7m", "minor seventh", "m7 min7 mi7 -7"],
        [
            "1P 3m 5P 7M",
            "minor/major seventh",
            "m/ma7 m/maj7 mM7 mMaj7 m/M7 -Δ7 mΔ -^7",
        ],
        ["1P 3m 5P 6M", "minor sixth", "m6 -6"],
        ["1P 3m 5P 7m 9M", "minor ninth", "m9 -9"],
        ["1P 3m 5P 7M 9M", "minor/major ninth", "mM9 mMaj9 -^9"],
        ["1P 3m 5P 7m 9M 11P", "minor eleventh", "m11 -11"],
        ["1P 3m 5P 7m 9M 13M", "minor thirteenth", "m13 -13"],
        // '''Diminished'''
        ["1P 3m 5d", "diminished", "dim ° o"],
        ["1P 3m 5d 7d", "diminished seventh", "dim7 °7 o7"],
        ["1P 3m 5d 7m", "half-diminished", "m7b5 ø -7b5 h7 h"],
        // ==Dominant/Seventh==
        // '''Normal'''
        ["1P 3M 5P 7m", "dominant seventh", "7 dom"],
        ["1P 3M 5P 7m 9M", "dominant ninth", "9"],
        ["1P 3M 5P 7m 9M 13M", "dominant thirteenth", "13"],
        ["1P 3M 5P 7m 11A", "lydian dominant seventh", "7#11 7#4"],
        // '''Altered'''
        ["1P 3M 5P 7m 9m", "dominant flat ninth", "7b9"],
        ["1P 3M 5P 7m 9A", "dominant sharp ninth", "7#9"],
        ["1P 3M 7m 9m", "altered", "alt7"],
        // '''Suspended'''
        ["1P 4P 5P", "suspended fourth", "sus4 sus"],
        ["1P 2M 5P", "suspended second", "sus2"],
        ["1P 4P 5P 7m", "suspended fourth seventh", "7sus4 7sus"],
        ["1P 5P 7m 9M 11P", "eleventh", "11"],
        [
            "1P 4P 5P 7m 9m",
            "suspended fourth flat ninth",
            "b9sus phryg 7b9sus 7b9sus4",
        ],
        // ==Other==
        ["1P 5P", "fifth", "5"],
        ["1P 3M 5A", "augmented", "aug + +5 ^#5"],
        ["1P 3m 5A", "minor augmented", "m#5 -#5 m+"],
        ["1P 3M 5A 7M", "augmented seventh", "maj7#5 maj7+5 +maj7 ^7#5"],
        [
            "1P 3M 5P 7M 9M 11A",
            "major sharp eleventh (lydian)",
            "maj9#11 Δ9#11 ^9#11",
        ],
        // ==Legacy==
        ["1P 2M 4P 5P", "", "sus24 sus4add9"],
        ["1P 3M 5A 7M 9M", "", "maj9#5 Maj9#5"],
        ["1P 3M 5A 7m", "", "7#5 +7 7+ 7aug aug7"],
        ["1P 3M 5A 7m 9A", "", "7#5#9 7#9#5 7alt"],
        ["1P 3M 5A 7m 9M", "", "9#5 9+"],
        ["1P 3M 5A 7m 9M 11A", "", "9#5#11"],
        ["1P 3M 5A 7m 9m", "", "7#5b9 7b9#5"],
        ["1P 3M 5A 7m 9m 11A", "", "7#5b9#11"],
        ["1P 3M 5A 9A", "", "+add#9"],
        ["1P 3M 5A 9M", "", "M#5add9 +add9"],
        ["1P 3M 5P 6M 11A", "", "M6#11 M6b5 6#11 6b5"],
        ["1P 3M 5P 6M 7M 9M", "", "M7add13"],
        ["1P 3M 5P 6M 9M 11A", "", "69#11"],
        ["1P 3m 5P 6M 9M", "", "m69 -69"],
        ["1P 3M 5P 6m 7m", "", "7b6"],
        ["1P 3M 5P 7M 9A 11A", "", "maj7#9#11"],
        ["1P 3M 5P 7M 9M 11A 13M", "", "M13#11 maj13#11 M13+4 M13#4"],
        ["1P 3M 5P 7M 9m", "", "M7b9"],
        ["1P 3M 5P 7m 11A 13m", "", "7#11b13 7b5b13"],
        ["1P 3M 5P 7m 13M", "", "7add6 67 7add13"],
        ["1P 3M 5P 7m 9A 11A", "", "7#9#11 7b5#9 7#9b5"],
        ["1P 3M 5P 7m 9A 11A 13M", "", "13#9#11"],
        ["1P 3M 5P 7m 9A 11A 13m", "", "7#9#11b13"],
        ["1P 3M 5P 7m 9A 13M", "", "13#9"],
        ["1P 3M 5P 7m 9A 13m", "", "7#9b13"],
        ["1P 3M 5P 7m 9M 11A", "", "9#11 9+4 9#4"],
        ["1P 3M 5P 7m 9M 11A 13M", "", "13#11 13+4 13#4"],
        ["1P 3M 5P 7m 9M 11A 13m", "", "9#11b13 9b5b13"],
        ["1P 3M 5P 7m 9m 11A", "", "7b9#11 7b5b9 7b9b5"],
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
        ["1P 3m 5P 6m 7M", "", "mMaj7b6"],
        ["1P 3m 5P 6m 7M 9M", "", "mMaj9b6"],
        ["1P 3m 5P 7m 11P", "", "m7add11 m7add4"],
        ["1P 3m 5P 9M", "", "madd9"],
        ["1P 3m 5d 6M 7M", "", "o7M7"],
        ["1P 3m 5d 7M", "", "oM7"],
        ["1P 3m 6m 7M", "", "mb6M7"],
        ["1P 3m 6m 7m", "", "m7#5"],
        ["1P 3m 6m 7m 9M", "", "m9#5"],
        ["1P 3m 5A 7m 9M 11P", "", "m11A"],
        ["1P 3m 6m 9m", "", "mb6b9"],
        ["1P 2M 3m 5d 7m", "", "m9b5"],
        ["1P 4P 5A 7M", "", "M7#5sus4"],
        ["1P 4P 5A 7M 9M", "", "M9#5sus4"],
        ["1P 4P 5A 7m", "", "7#5sus4"],
        ["1P 4P 5P 7M", "", "M7sus4"],
        ["1P 4P 5P 7M 9M", "", "M9sus4"],
        ["1P 4P 5P 7m 9M", "", "9sus4 9sus"],
        ["1P 4P 5P 7m 9M 13M", "", "13sus4 13sus"],
        ["1P 4P 5P 7m 9m 13m", "", "7sus4b9b13 7b9b13sus4"],
        ["1P 4P 7m 10m", "", "4 quartal"],
        ["1P 5P 7m 9m 11P", "", "11b9"],
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
        chordType: chordType,
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


},{"@tonaljs/core":8,"@tonaljs/pcset":15}],6:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/chord-detect'), require('@tonaljs/chord-type'), require('@tonaljs/core'), require('@tonaljs/pcset'), require('@tonaljs/scale-type')) :
    typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/chord-detect', '@tonaljs/chord-type', '@tonaljs/core', '@tonaljs/pcset', '@tonaljs/scale-type'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Chord = {}, global.chordDetect, global.chordType, global.core, global.pcset, global.scaleType));
}(this, (function (exports, chordDetect, chordType, core, pcset, scaleType) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
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
        symbol: "",
        root: "",
        rootDegree: 0,
        type: "",
        tonic: null,
        setNum: NaN,
        quality: "Unknown",
        chroma: "",
        normalized: "",
        aliases: [],
        notes: [],
        intervals: [],
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
        if (src === "") {
            return NoChord;
        }
        if (Array.isArray(src) && src.length === 2) {
            return getChord(src[1], src[0]);
        }
        else {
            var _a = tokenize(src), tonic = _a[0], type = _a[1];
            var chord_1 = getChord(type, tonic);
            return chord_1.empty ? getChord(src) : chord_1;
        }
    }
    /**
     * Get chord properties
     *
     * @param typeName - the chord type name
     * @param [tonic] - Optional tonic
     * @param [root]  - Optional root (requires a tonic)
     */
    function getChord(typeName, optionalTonic, optionalRoot) {
        var type = chordType.get(typeName);
        var tonic = core.note(optionalTonic || "");
        var root = core.note(optionalRoot || "");
        if (type.empty ||
            (optionalTonic && tonic.empty) ||
            (optionalRoot && root.empty)) {
            return NoChord;
        }
        var rootInterval = core.distance(tonic.pc, root.pc);
        var rootDegree = type.intervals.indexOf(rootInterval) + 1;
        if (!root.empty && !rootDegree) {
            return NoChord;
        }
        var intervals = Array.from(type.intervals);
        for (var i = 1; i < rootDegree; i++) {
            var num = intervals[0][0];
            var quality = intervals[0][1];
            var newNum = parseInt(num, 10) + 7;
            intervals.push("" + newNum + quality);
            intervals.shift();
        }
        var notes = tonic.empty
            ? []
            : intervals.map(function (i) { return core.transpose(tonic, i); });
        typeName = type.aliases.indexOf(typeName) !== -1 ? typeName : type.aliases[0];
        var symbol = "" + (tonic.empty ? "" : tonic.pc) + typeName + (root.empty || rootDegree <= 1 ? "" : "/" + root.pc);
        var name = "" + (optionalTonic ? tonic.pc + " " : "") + type.name + (rootDegree > 1 && optionalRoot ? " over " + root.pc : "");
        return __assign(__assign({}, type), { name: name,
            symbol: symbol, type: type.name, root: root.name, intervals: intervals,
            rootDegree: rootDegree, tonic: tonic.name, notes: notes });
    }
    var chord = core.deprecate("Chord.chord", "Chord.get", get);
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
            return chordName;
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
        getChord: getChord,
        get: get,
        detect: chordDetect.detect,
        chordScales: chordScales,
        extended: extended,
        reduced: reduced,
        tokenize: tokenize,
        transpose: transpose,
        // deprecate
        chord: chord,
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
    exports.getChord = getChord;
    exports.reduced = reduced;
    exports.tokenize = tokenize;
    exports.transpose = transpose;

    Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/chord-detect":4,"@tonaljs/chord-type":5,"@tonaljs/core":8,"@tonaljs/pcset":15,"@tonaljs/scale-type":19}],7:[function(require,module,exports){
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
      shuffle: shuffle,
  };

  exports.compact = compact;
  exports.default = index;
  exports.permutations = permutations;
  exports.range = range;
  exports.rotate = rotate;
  exports.shuffle = shuffle;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{}],8:[function(require,module,exports){
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
  var mod = function (n, m) { return ((n % m) + m) % m; };
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
      var height = oct === undefined
          ? mod(SEMI[step] + alt, 12) - 12 * 99
          : SEMI[step] + alt + 12 * (oct + 1);
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
          step: step,
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
          oct: oct,
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


},{}],9:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = global || self, factory(global.DurationValue = {}));
}(this, (function (exports) { 'use strict';

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

    // source: https://en.wikipedia.org/wiki/Note_value
    var DATA = [
        [
            0.125,
            "dl",
            ["large", "duplex longa", "maxima", "octuple", "octuple whole"],
        ],
        [0.25, "l", ["long", "longa"]],
        [0.5, "d", ["double whole", "double", "breve"]],
        [1, "w", ["whole", "semibreve"]],
        [2, "h", ["half", "minim"]],
        [4, "q", ["quarter", "crotchet"]],
        [8, "e", ["eighth", "quaver"]],
        [16, "s", ["sixteenth", "semiquaver"]],
        [32, "t", ["thirty-second", "demisemiquaver"]],
        [64, "sf", ["sixty-fourth", "hemidemisemiquaver"]],
        [128, "h", ["hundred twenty-eighth"]],
        [256, "th", ["two hundred fifty-sixth"]],
    ];

    var VALUES = [];
    DATA.forEach(function (_a) {
        var denominator = _a[0], shorthand = _a[1], names = _a[2];
        return add(denominator, shorthand, names);
    });
    var NoDuration = {
        empty: true,
        name: "",
        value: 0,
        fraction: [0, 0],
        shorthand: "",
        dots: "",
        names: [],
    };
    function names() {
        return VALUES.reduce(function (names, duration) {
            duration.names.forEach(function (name) { return names.push(name); });
            return names;
        }, []);
    }
    function shorthands() {
        return VALUES.map(function (dur) { return dur.shorthand; });
    }
    var REGEX = /^([^.]+)(\.*)$/;
    function get(name) {
        var _a = REGEX.exec(name) || [], _ = _a[0], simple = _a[1], dots = _a[2];
        var base = VALUES.find(function (dur) { return dur.shorthand === simple || dur.names.includes(simple); });
        if (!base) {
            return NoDuration;
        }
        var fraction = calcDots(base.fraction, dots.length);
        var value = fraction[0] / fraction[1];
        return __assign(__assign({}, base), { name: name, dots: dots, value: value, fraction: fraction });
    }
    var value = function (name) { return get(name).value; };
    var fraction = function (name) { return get(name).fraction; };
    var index = { names: names, shorthands: shorthands, get: get, value: value, fraction: fraction };
    //// PRIVATE ////
    function add(denominator, shorthand, names) {
        VALUES.push({
            empty: false,
            dots: "",
            name: "",
            value: 1 / denominator,
            fraction: denominator < 1 ? [1 / denominator, 1] : [1, denominator],
            shorthand: shorthand,
            names: names,
        });
    }
    function calcDots(fraction, dots) {
        var pow = Math.pow(2, dots);
        var numerator = fraction[0] * pow;
        var denominator = fraction[1] * pow;
        var base = numerator;
        // add fractions
        for (var i = 0; i < dots; i++) {
            numerator += base / Math.pow(2, i + 1);
        }
        // simplify
        while (numerator % 2 === 0 && denominator % 2 === 0) {
            numerator /= 2;
            denominator /= 2;
        }
        return [numerator, denominator];
    }

    exports.default = index;
    exports.fraction = fraction;
    exports.get = get;
    exports.names = names;
    exports.shorthands = shorthands;
    exports.value = value;

    Object.defineProperty(exports, '__esModule', { value: true });

})));


},{}],10:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core'], factory) :
  (global = global || self, factory(global.Interval = {}, global.core));
}(this, (function (exports, core) { 'use strict';

  /**
   * Get the natural list of names
   */
  function names() {
      return "1P 2M 3M 4P 5P 6m 7m".split(" ");
  }
  /**
   * Get properties of an interval
   *
   * @function
   * @example
   * Interval.get('P4') // => {"alt": 0,  "dir": 1,  "name": "4P", "num": 4, "oct": 0, "q": "P", "semitones": 5, "simple": 4, "step": 3, "type": "perfectable"}
   */
  var get = core.interval;
  /**
   * Get name of an interval
   *
   * @function
   * @example
   * Interval.name('4P') // => "4P"
   * Interval.name('P4') // => "4P"
   * Interval.name('C4') // => ""
   */
  var name = function (name) { return core.interval(name).name; };
  /**
   * Get semitones of an interval
   * @function
   * @example
   * Interval.semitones('P4') // => 5
   */
  var semitones = function (name) { return core.interval(name).semitones; };
  /**
   * Get quality of an interval
   * @function
   * @example
   * Interval.quality('P4') // => "P"
   */
  var quality = function (name) { return core.interval(name).q; };
  /**
   * Get number of an interval
   * @function
   * @example
   * Interval.num('P4') // => 4
   */
  var num = function (name) { return core.interval(name).num; };
  /**
   * Get the simplified version of an interval.
   *
   * @function
   * @param {string} interval - the interval to simplify
   * @return {string} the simplified interval
   *
   * @example
   * Interval.simplify("9M") // => "2M"
   * Interval.simplify("2M") // => "2M"
   * Interval.simplify("-2M") // => "7m"
   * ["8P", "9M", "10M", "11P", "12P", "13M", "14M", "15P"].map(Interval.simplify)
   * // => [ "8P", "2M", "3M", "4P", "5P", "6M", "7M", "8P" ]
   */
  function simplify(name) {
      var i = core.interval(name);
      return i.empty ? "" : i.simple + i.q;
  }
  /**
   * Get the inversion (https://en.wikipedia.org/wiki/Inversion_(music)#Intervals)
   * of an interval.
   *
   * @function
   * @param {string} interval - the interval to invert in interval shorthand
   * notation or interval array notation
   * @return {string} the inverted interval
   *
   * @example
   * Interval.invert("3m") // => "6M"
   * Interval.invert("2M") // => "7m"
   */
  function invert(name) {
      var i = core.interval(name);
      if (i.empty) {
          return "";
      }
      var step = (7 - i.step) % 7;
      var alt = i.type === "perfectable" ? -i.alt : -(i.alt + 1);
      return core.interval({ step: step, alt: alt, oct: i.oct, dir: i.dir }).name;
  }
  // interval numbers
  var IN = [1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7];
  // interval qualities
  var IQ = "P m M m M P d P m M m M".split(" ");
  /**
   * Get interval name from semitones number. Since there are several interval
   * names for the same number, the name it's arbitrary, but deterministic.
   *
   * @param {Integer} num - the number of semitones (can be negative)
   * @return {string} the interval name
   * @example
   * Interval.fromSemitones(7) // => "5P"
   * Interval.fromSemitones(-7) // => "-5P"
   */
  function fromSemitones(semitones) {
      var d = semitones < 0 ? -1 : 1;
      var n = Math.abs(semitones);
      var c = n % 12;
      var o = Math.floor(n / 12);
      return d * (IN[c] + 7 * o) + IQ[c];
  }
  /**
   * Find interval between two notes
   *
   * @example
   * Interval.distance("C4", "G4"); // => "5P"
   */
  var distance = core.distance;
  /**
   * Adds two intervals
   *
   * @function
   * @param {string} interval1
   * @param {string} interval2
   * @return {string} the added interval name
   * @example
   * Interval.add("3m", "5P") // => "7m"
   */
  var add = combinator(function (a, b) { return [a[0] + b[0], a[1] + b[1]]; });
  /**
   * Returns a function that adds an interval
   *
   * @function
   * @example
   * ['1P', '2M', '3M'].map(Interval.addTo('5P')) // => ["5P", "6M", "7M"]
   */
  var addTo = function (interval) { return function (other) {
      return add(interval, other);
  }; };
  /**
   * Subtracts two intervals
   *
   * @function
   * @param {string} minuendInterval
   * @param {string} subtrahendInterval
   * @return {string} the substracted interval name
   * @example
   * Interval.substract('5P', '3M') // => '3m'
   * Interval.substract('3M', '5P') // => '-3m'
   */
  var substract = combinator(function (a, b) { return [a[0] - b[0], a[1] - b[1]]; });
  var index = {
      names: names,
      get: get,
      name: name,
      num: num,
      semitones: semitones,
      quality: quality,
      fromSemitones: fromSemitones,
      distance: distance,
      invert: invert,
      simplify: simplify,
      add: add,
      addTo: addTo,
      substract: substract,
  };
  function combinator(fn) {
      return function (a, b) {
          var coordA = core.interval(a).coord;
          var coordB = core.interval(b).coord;
          if (coordA && coordB) {
              var coord = fn(coordA, coordB);
              return core.coordToInterval(coord).name;
          }
      };
  }

  exports.add = add;
  exports.addTo = addTo;
  exports.default = index;
  exports.distance = distance;
  exports.fromSemitones = fromSemitones;
  exports.get = get;
  exports.invert = invert;
  exports.name = name;
  exports.names = names;
  exports.num = num;
  exports.quality = quality;
  exports.semitones = semitones;
  exports.simplify = simplify;
  exports.substract = substract;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/core":8}],11:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core'), require('@tonaljs/note'), require('@tonaljs/roman-numeral')) :
    typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core', '@tonaljs/note', '@tonaljs/roman-numeral'], factory) :
    (global = global || self, factory(global.Key = {}, global.core, global.note, global.romanNumeral));
}(this, (function (exports, core, note, romanNumeral) { 'use strict';

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

    var mapToScale = function (scale) { return function (symbols, sep) {
        if (sep === void 0) { sep = ""; }
        return symbols.map(function (symbol, index) {
            return symbol !== "-" ? scale[index] + sep + symbol : "";
        });
    }; };
    function keyScale(gradesLiteral, chordsLiteral, hfLiteral, chordScalesLiteral) {
        return function (tonic) {
            var grades = gradesLiteral.split(" ");
            var intervals = grades.map(function (gr) { return romanNumeral.get(gr).interval || ""; });
            var scale = intervals.map(function (interval) { return core.transpose(tonic, interval); });
            var map = mapToScale(scale);
            return {
                tonic: tonic,
                grades: grades,
                intervals: intervals,
                scale: scale,
                chords: map(chordsLiteral.split(" ")),
                chordsHarmonicFunction: hfLiteral.split(" "),
                chordScales: map(chordScalesLiteral.split(","), " "),
            };
        };
    }
    var distInFifths = function (from, to) {
        var f = core.note(from);
        var t = core.note(to);
        return f.empty || t.empty ? 0 : t.coord[0] - f.coord[0];
    };
    var MajorScale = keyScale("I II III IV V VI VII", "maj7 m7 m7 maj7 7 m7 m7b5", "T SD T SD D T D", "major,dorian,phrygian,lydian,mixolydian,minor,locrian");
    var NaturalScale = keyScale("I II bIII IV V bVI bVII", "m7 m7b5 maj7 m7 m7 maj7 7", "T SD T SD D SD SD", "minor,locrian,major,dorian,phrygian,lydian,mixolydian");
    var HarmonicScale = keyScale("I II bIII IV V bVI VII", "mmaj7 m7b5 +maj7 m7 7 maj7 mo7", "T SD T SD D SD D", "harmonic minor,locrian 6,major augmented,lydian diminished,phrygian dominant,lydian #9,ultralocrian");
    var MelodicScale = keyScale("I II bIII IV V VI VII", "m6 m7 +maj7 7 7 m7b5 m7b5", "T SD T SD D - -", "melodic minor,dorian b2,lydian augmented,lydian dominant,mixolydian b6,locrian #2,altered");
    /**
     * Get a major key properties in a given tonic
     * @param tonic
     */
    function majorKey(tonic) {
        var keyScale = MajorScale(tonic);
        var alteration = distInFifths("C", tonic);
        var map = mapToScale(keyScale.scale);
        return __assign(__assign({}, keyScale), { type: "major", minorRelative: core.transpose(tonic, "-3m"), alteration: alteration, keySignature: core.altToAcc(alteration), secondaryDominants: map("- VI7 VII7 I7 II7 III7 -".split(" ")), secondaryDominantsMinorRelative: map("- IIIm7b5 IV#m7 Vm7 VIm7 VIIm7b5 -".split(" ")), substituteDominants: map("- bIII7 IV7 bV7 bVI7 bVII7 -".split(" ")), substituteDominantsMinorRelative: map("- IIIm7 Im7 IIbm7 VIm7 IVm7 -".split(" ")) });
    }
    /**
     * Get minor key properties in a given tonic
     * @param tonic
     */
    function minorKey(tonic) {
        var alteration = distInFifths("C", tonic) - 3;
        return {
            type: "minor",
            tonic: tonic,
            relativeMajor: core.transpose(tonic, "3m"),
            alteration: alteration,
            keySignature: core.altToAcc(alteration),
            natural: NaturalScale(tonic),
            harmonic: HarmonicScale(tonic),
            melodic: MelodicScale(tonic),
        };
    }
    /**
     * Given a key signature, returns the tonic of the major key
     * @param sigature
     * @example
     * majorTonicFromKeySignature('###') // => 'A'
     */
    function majorTonicFromKeySignature(sig) {
        if (typeof sig === "number") {
            return note.transposeFifths("C", sig);
        }
        else if (typeof sig === "string" && /^b+|#+$/.test(sig)) {
            return note.transposeFifths("C", core.accToAlt(sig));
        }
        return null;
    }
    var index = { majorKey: majorKey, majorTonicFromKeySignature: majorTonicFromKeySignature, minorKey: minorKey };

    exports.default = index;
    exports.majorKey = majorKey;
    exports.majorTonicFromKeySignature = majorTonicFromKeySignature;
    exports.minorKey = minorKey;

    Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/core":8,"@tonaljs/note":14,"@tonaljs/roman-numeral":18}],12:[function(require,module,exports){
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
      if (isNaN(midi) || midi === -Infinity || midi === Infinity)
          return "";
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


},{"@tonaljs/core":8}],13:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core'), require('@tonaljs/pcset')) :
    typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core', '@tonaljs/pcset'], factory) :
    (global = global || self, factory(global.Mode = {}, global.core, global.pcset));
}(this, (function (exports, core, pcset) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
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

    var DATA = [
        [0, 2773, 0, "ionian", "", "Maj7", "major"],
        [1, 2902, 2, "dorian", "m", "m7"],
        [2, 3418, 4, "phrygian", "m", "m7"],
        [3, 2741, -1, "lydian", "", "Maj7"],
        [4, 2774, 1, "mixolydian", "", "7"],
        [5, 2906, 3, "aeolian", "m", "m7", "minor"],
        [6, 3434, 5, "locrian", "dim", "m7b5"],
    ];

    var NoMode = __assign(__assign({}, pcset.EmptyPcset), { name: "", alt: 0, modeNum: NaN, triad: "", seventh: "", aliases: [] });
    var modes = DATA.map(toMode);
    var index = {};
    modes.forEach(function (mode) {
        index[mode.name] = mode;
        mode.aliases.forEach(function (alias) {
            index[alias] = mode;
        });
    });
    /**
     * Get a Mode by it's name
     *
     * @example
     * get('dorian')
     * // =>
     * // {
     * //   intervals: [ '1P', '2M', '3m', '4P', '5P', '6M', '7m' ],
     * //   modeNum: 1,
     * //   chroma: '101101010110',
     * //   normalized: '101101010110',
     * //   name: 'dorian',
     * //   setNum: 2902,
     * //   alt: 2,
     * //   triad: 'm',
     * //   seventh: 'm7',
     * //   aliases: []
     * // }
     */
    function get(name) {
        return typeof name === "string"
            ? index[name.toLowerCase()] || NoMode
            : name && name.name
                ? get(name.name)
                : NoMode;
    }
    var mode = core.deprecate("Mode.mode", "Mode.get", get);
    /**
     * Get a list of all modes
     */
    function all() {
        return modes.slice();
    }
    var entries = core.deprecate("Mode.mode", "Mode.all", all);
    /**
     * Get a list of all mode names
     */
    function names() {
        return modes.map(function (mode) { return mode.name; });
    }
    function toMode(mode) {
        var modeNum = mode[0], setNum = mode[1], alt = mode[2], name = mode[3], triad = mode[4], seventh = mode[5], alias = mode[6];
        var aliases = alias ? [alias] : [];
        var chroma = Number(setNum).toString(2);
        var intervals = pcset.chromaToIntervals(chroma);
        return {
            empty: false,
            intervals: intervals,
            modeNum: modeNum,
            chroma: chroma,
            normalized: chroma,
            name: name,
            setNum: setNum,
            alt: alt,
            triad: triad,
            seventh: seventh,
            aliases: aliases,
        };
    }
    var index$1 = {
        get: get,
        names: names,
        all: all,
        // deprecated
        entries: entries,
        mode: mode,
    };

    exports.all = all;
    exports.default = index$1;
    exports.entries = entries;
    exports.get = get;
    exports.mode = mode;
    exports.names = names;

    Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/core":8,"@tonaljs/pcset":15}],14:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core'), require('@tonaljs/midi')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core', '@tonaljs/midi'], factory) :
  (global = global || self, factory(global.Note = {}, global.core, global.midi$1));
}(this, (function (exports, core, midi$1) { 'use strict';

  var NAMES = ["C", "D", "E", "F", "G", "A", "B"];
  var toName = function (n) { return n.name; };
  var onlyNotes = function (array) {
      return array.map(core.note).filter(function (n) { return !n.empty; });
  };
  /**
   * Return the natural note names without octave
   * @function
   * @example
   * Note.names(); // => ["C", "D", "E", "F", "G", "A", "B"]
   */
  function names(array) {
      if (array === undefined) {
          return NAMES.slice();
      }
      else if (!Array.isArray(array)) {
          return [];
      }
      else {
          return onlyNotes(array).map(toName);
      }
  }
  /**
   * Get a note from a note name
   *
   * @function
   * @example
   * Note.get('Bb4') // => { name: "Bb4", midi: 70, chroma: 10, ... }
   */
  var get = core.note;
  /**
   * Get the note name
   * @function
   */
  var name = function (note) { return get(note).name; };
  /**
   * Get the note pitch class name
   * @function
   */
  var pitchClass = function (note) { return get(note).pc; };
  /**
   * Get the note accidentals
   * @function
   */
  var accidentals = function (note) { return get(note).acc; };
  /**
   * Get the note octave
   * @function
   */
  var octave = function (note) { return get(note).oct; };
  /**
   * Get the note midi
   * @function
   */
  var midi = function (note) { return get(note).midi; };
  /**
   * Get the note midi
   * @function
   */
  var freq = function (note) { return get(note).freq; };
  /**
   * Get the note chroma
   * @function
   */
  var chroma = function (note) { return get(note).chroma; };
  /**
   * Given a midi number, returns a note name. Uses flats for altered notes.
   *
   * @function
   * @param {number} midi - the midi note number
   * @return {string} the note name
   * @example
   * Note.fromMidi(61) // => "Db4"
   * Note.fromMidi(61.7) // => "D4"
   */
  function fromMidi(midi) {
      return midi$1.midiToNoteName(midi);
  }
  /**
   * Given a midi number, returns a note name. Uses flats for altered notes.
   */
  function fromFreq(freq) {
      return midi$1.midiToNoteName(midi$1.freqToMidi(freq));
  }
  /**
   * Given a midi number, returns a note name. Uses flats for altered notes.
   */
  function fromFreqSharps(freq) {
      return midi$1.midiToNoteName(midi$1.freqToMidi(freq), { sharps: true });
  }
  /**
   * Given a midi number, returns a note name. Uses flats for altered notes.
   *
   * @function
   * @param {number} midi - the midi note number
   * @return {string} the note name
   * @example
   * Note.fromMidiSharps(61) // => "C#4"
   */
  function fromMidiSharps(midi) {
      return midi$1.midiToNoteName(midi, { sharps: true });
  }
  /**
   * Transpose a note by an interval
   */
  var transpose = core.transpose;
  var tr = core.transpose;
  /**
   * Transpose by an interval.
   * @function
   * @param {string} interval
   * @return {function} a function that transposes by the given interval
   * @example
   * ["C", "D", "E"].map(Note.transposeBy("5P"));
   * // => ["G", "A", "B"]
   */
  var transposeBy = function (interval) { return function (note) {
      return transpose(note, interval);
  }; };
  var trBy = transposeBy;
  /**
   * Transpose from a note
   * @function
   * @param {string} note
   * @return {function}  a function that transposes the the note by an interval
   * ["1P", "3M", "5P"].map(Note.transposeFrom("C"));
   * // => ["C", "E", "G"]
   */
  var transposeFrom = function (note) { return function (interval) {
      return transpose(note, interval);
  }; };
  var trFrom = transposeFrom;
  /**
   * Transpose a note by a number of perfect fifths.
   *
   * @function
   * @param {string} note - the note name
   * @param {number} fifhts - the number of fifths
   * @return {string} the transposed note name
   *
   * @example
   * import { transposeFifths } from "@tonaljs/note"
   * transposeFifths("G4", 1) // => "D"
   * [0, 1, 2, 3, 4].map(fifths => transposeFifths("C", fifths)) // => ["C", "G", "D", "A", "E"]
   */
  function transposeFifths(noteName, fifths) {
      var note = get(noteName);
      if (note.empty) {
          return "";
      }
      var _a = note.coord, nFifths = _a[0], nOcts = _a[1];
      var transposed = nOcts === undefined
          ? core.coordToNote([nFifths + fifths])
          : core.coordToNote([nFifths + fifths, nOcts]);
      return transposed.name;
  }
  var trFifths = transposeFifths;
  var ascending = function (a, b) { return a.height - b.height; };
  var descending = function (a, b) { return b.height - a.height; };
  function sortedNames(notes, comparator) {
      comparator = comparator || ascending;
      return onlyNotes(notes).sort(comparator).map(toName);
  }
  function sortedUniqNames(notes) {
      return sortedNames(notes, ascending).filter(function (n, i, a) { return i === 0 || n !== a[i - 1]; });
  }
  /**
   * Simplify a note
   *
   * @function
   * @param {string} note - the note to be simplified
   * - sameAccType: default true. Use same kind of accidentals that source
   * @return {string} the simplified note or '' if not valid note
   * @example
   * simplify("C##") // => "D"
   * simplify("C###") // => "D#"
   * simplify("C###")
   * simplify("B#4") // => "C5"
   */
  var simplify = nameBuilder(true);
  /**
   * Get enharmonic of a note
   *
   * @function
   * @param {string} note
   * @return {string} the enharmonic note or '' if not valid note
   * @example
   * Note.enharmonic("Db") // => "C#"
   * Note.enharmonic("C") // => "C"
   */
  var enharmonic = nameBuilder(false);
  function nameBuilder(sameAccidentals) {
      return function (noteName) {
          var note = get(noteName);
          if (note.empty) {
              return "";
          }
          var sharps = sameAccidentals ? note.alt > 0 : note.alt < 0;
          var pitchClass = note.midi === null;
          return midi$1.midiToNoteName(note.midi || note.chroma, { sharps: sharps, pitchClass: pitchClass });
      };
  }
  var index = {
      names: names,
      get: get,
      name: name,
      pitchClass: pitchClass,
      accidentals: accidentals,
      octave: octave,
      midi: midi,
      ascending: ascending,
      descending: descending,
      sortedNames: sortedNames,
      sortedUniqNames: sortedUniqNames,
      fromMidi: fromMidi,
      fromMidiSharps: fromMidiSharps,
      freq: freq,
      fromFreq: fromFreq,
      fromFreqSharps: fromFreqSharps,
      chroma: chroma,
      transpose: transpose,
      tr: tr,
      transposeBy: transposeBy,
      trBy: trBy,
      transposeFrom: transposeFrom,
      trFrom: trFrom,
      transposeFifths: transposeFifths,
      trFifths: trFifths,
      simplify: simplify,
      enharmonic: enharmonic,
  };

  exports.accidentals = accidentals;
  exports.ascending = ascending;
  exports.chroma = chroma;
  exports.default = index;
  exports.descending = descending;
  exports.enharmonic = enharmonic;
  exports.freq = freq;
  exports.fromFreq = fromFreq;
  exports.fromFreqSharps = fromFreqSharps;
  exports.fromMidi = fromMidi;
  exports.fromMidiSharps = fromMidiSharps;
  exports.get = get;
  exports.midi = midi;
  exports.name = name;
  exports.names = names;
  exports.octave = octave;
  exports.pitchClass = pitchClass;
  exports.simplify = simplify;
  exports.sortedNames = sortedNames;
  exports.sortedUniqNames = sortedUniqNames;
  exports.tr = tr;
  exports.trBy = trBy;
  exports.trFifths = trFifths;
  exports.trFrom = trFrom;
  exports.transpose = transpose;
  exports.transposeBy = transposeBy;
  exports.transposeFifths = transposeFifths;
  exports.transposeFrom = transposeFrom;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/core":8,"@tonaljs/midi":12}],15:[function(require,module,exports){
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
      intervals: [],
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
      "7M",
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
      pcset: pcset,
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
          intervals: intervals,
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


},{"@tonaljs/collection":7,"@tonaljs/core":8}],16:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/chord'), require('@tonaljs/core'), require('@tonaljs/roman-numeral')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/chord', '@tonaljs/core', '@tonaljs/roman-numeral'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Progression = {}, global.chord, global.core, global.romanNumeral));
}(this, (function (exports, chord, core, romanNumeral) { 'use strict';

  /**
   * Given a tonic and a chord list expressed with roman numeral notation
   * returns the progression expressed with leadsheet chords symbols notation
   * @example
   * fromRomanNumerals("C", ["I", "IIm7", "V7"]);
   * // => ["C", "Dm7", "G7"]
   */
  function fromRomanNumerals(tonic, chords) {
      var romanNumerals = chords.map(romanNumeral.get);
      return romanNumerals.map(function (rn) { return core.transpose(tonic, core.interval(rn)) + rn.chordType; });
  }
  /**
   * Given a tonic and a chord list with leadsheet symbols notation,
   * return the chord list with roman numeral notation
   * @example
   * toRomanNumerals("C", ["CMaj7", "Dm7", "G7"]);
   * // => ["IMaj7", "IIm7", "V7"]
   */
  function toRomanNumerals(tonic, chords) {
      return chords.map(function (chord$1) {
          var _a = chord.tokenize(chord$1), note = _a[0], chordType = _a[1];
          var intervalName = core.distance(tonic, note);
          var roman = romanNumeral.get(core.interval(intervalName));
          return roman.name + chordType;
      });
  }
  var index = { fromRomanNumerals: fromRomanNumerals, toRomanNumerals: toRomanNumerals };

  exports.default = index;
  exports.fromRomanNumerals = fromRomanNumerals;
  exports.toRomanNumerals = toRomanNumerals;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/chord":6,"@tonaljs/core":8,"@tonaljs/roman-numeral":18}],17:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/collection'), require('@tonaljs/midi')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/collection', '@tonaljs/midi'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Range = {}, global.collection, global.midi));
}(this, (function (exports, collection, midi) { 'use strict';

  /**
   * Create a numeric range. You supply a list of notes or numbers and it will
   * be connected to create complex ranges.
   *
   * @param {Array} notes - the list of notes or midi numbers used
   * @return {Array} an array of numbers or empty array if not valid parameters
   *
   * @example
   * numeric(["C5", "C4"]) // => [ 72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60 ]
   * // it works midi notes
   * numeric([10, 5]) // => [ 10, 9, 8, 7, 6, 5 ]
   * // complex range
   * numeric(["C4", "E4", "Bb3"]) // => [60, 61, 62, 63, 64, 63, 62, 61, 60, 59, 58]
   */
  function numeric(notes) {
      var midi$1 = collection.compact(notes.map(midi.toMidi));
      if (!notes.length || midi$1.length !== notes.length) {
          // there is no valid notes
          return [];
      }
      return midi$1.reduce(function (result, note) {
          var last = result[result.length - 1];
          return result.concat(collection.range(last, note).slice(1));
      }, [midi$1[0]]);
  }
  /**
   * Create a range of chromatic notes. The altered notes will use flats.
   *
   * @function
   * @param {Array} notes - the list of notes or midi note numbers to create a range from
   * @param {Object} options - The same as `midiToNoteName` (`{ sharps: boolean, pitchClass: boolean }`)
   * @return {Array} an array of note names
   *
   * @example
   * Range.chromatic(["C2, "E2", "D2"]) // => ["C2", "Db2", "D2", "Eb2", "E2", "Eb2", "D2"]
   * // with sharps
   * Range.chromatic(["C2", "C3"], { sharps: true }) // => [ "C2", "C#2", "D2", "D#2", "E2", "F2", "F#2", "G2", "G#2", "A2", "A#2", "B2", "C3" ]
   */
  function chromatic(notes, options) {
      return numeric(notes).map(function (midi$1) { return midi.midiToNoteName(midi$1, options); });
  }
  var index = { numeric: numeric, chromatic: chromatic };

  exports.chromatic = chromatic;
  exports.default = index;
  exports.numeric = numeric;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/collection":7,"@tonaljs/midi":12}],18:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core'], factory) :
  (global = global || self, factory(global.RomanNumeral = {}, global.core));
}(this, (function (exports, core) { 'use strict';

  var NoRomanNumeral = { empty: true, name: "", chordType: "" };
  var cache = {};
  /**
   * Get properties of a roman numeral string
   *
   * @function
   * @param {string} - the roman numeral string (can have type, like: Imaj7)
   * @return {Object} - the roman numeral properties
   * @param {string} name - the roman numeral (tonic)
   * @param {string} type - the chord type
   * @param {string} num - the number (1 = I, 2 = II...)
   * @param {boolean} major - major or not
   *
   * @example
   * romanNumeral("VIIb5") // => { name: "VII", type: "b5", num: 7, major: true }
   */
  function get(src) {
      return typeof src === "string"
          ? cache[src] || (cache[src] = parse(src))
          : typeof src === "number"
              ? get(NAMES[src] || "")
              : core.isPitch(src)
                  ? fromPitch(src)
                  : core.isNamed(src)
                      ? get(src.name)
                      : NoRomanNumeral;
  }
  var romanNumeral = core.deprecate("RomanNumeral.romanNumeral", "RomanNumeral.get", get);
  /**
   * Get roman numeral names
   *
   * @function
   * @param {boolean} [isMajor=true]
   * @return {Array<String>}
   *
   * @example
   * names() // => ["I", "II", "III", "IV", "V", "VI", "VII"]
   */
  function names(major) {
      if (major === void 0) { major = true; }
      return (major ? NAMES : NAMES_MINOR).slice();
  }
  function fromPitch(pitch) {
      return get(core.altToAcc(pitch.alt) + NAMES[pitch.step]);
  }
  var REGEX = /^(#{1,}|b{1,}|x{1,}|)(IV|I{1,3}|VI{0,2}|iv|i{1,3}|vi{0,2})([^IViv]*)$/;
  function tokenize(str) {
      return (REGEX.exec(str) || ["", "", "", ""]);
  }
  var ROMANS = "I II III IV V VI VII";
  var NAMES = ROMANS.split(" ");
  var NAMES_MINOR = ROMANS.toLowerCase().split(" ");
  function parse(src) {
      var _a = tokenize(src), name = _a[0], acc = _a[1], roman = _a[2], chordType = _a[3];
      if (!roman) {
          return NoRomanNumeral;
      }
      var upperRoman = roman.toUpperCase();
      var step = NAMES.indexOf(upperRoman);
      var alt = core.accToAlt(acc);
      var dir = 1;
      return {
          empty: false,
          name: name,
          roman: roman,
          interval: core.interval({ step: step, alt: alt, dir: dir }).name,
          acc: acc,
          chordType: chordType,
          alt: alt,
          step: step,
          major: roman === upperRoman,
          oct: 0,
          dir: dir,
      };
  }
  var index = {
      names: names,
      get: get,
      // deprecated
      romanNumeral: romanNumeral,
  };

  exports.default = index;
  exports.get = get;
  exports.names = names;
  exports.tokenize = tokenize;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/core":8}],19:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/core'), require('@tonaljs/pcset')) :
    typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/core', '@tonaljs/pcset'], factory) :
    (global = global || self, factory(global.ScaleType = {}, global.core, global.pcset));
}(this, (function (exports, core, pcset) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
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
        ["1P 2M 3m 3M 5P 6M", "major blues"],
        ["1P 2M 4P 5P 6M 7m", "piongio"],
        ["1P 2m 3M 4A 6M 7m", "prometheus neopolitan"],
        ["1P 2M 3M 4A 6M 7m", "prometheus"],
        ["1P 2m 3M 5d 6m 7m", "mystery #1"],
        ["1P 2m 3M 4P 5A 6M", "six tone symmetric"],
        ["1P 2M 3M 4A 5A 7m", "whole tone", "messiaen's mode #1"],
        ["1P 2m 4P 4A 5P 7M", "messiaen's mode #5"],
        ["1P 3m 4P 5d 5P 7m", "minor blues", "blues"],
        // 7-note scales
        ["1P 2M 3M 4P 5d 6m 7m", "locrian major", "arabian"],
        ["1P 2m 3M 4A 5P 6m 7M", "double harmonic lydian"],
        ["1P 2M 3m 4P 5P 6m 7M", "harmonic minor"],
        [
            "1P 2m 3m 4d 5d 6m 7m",
            "altered",
            "super locrian",
            "diminished whole tone",
            "pomeroy",
        ],
        ["1P 2M 3m 4P 5d 6m 7m", "locrian #2", "half-diminished", "aeolian b5"],
        [
            "1P 2M 3M 4P 5P 6m 7m",
            "mixolydian b6",
            "melodic minor fifth mode",
            "hindu",
        ],
        ["1P 2M 3M 4A 5P 6M 7m", "lydian dominant", "lydian b7", "overtone"],
        ["1P 2M 3M 4A 5P 6M 7M", "lydian"],
        ["1P 2M 3M 4A 5A 6M 7M", "lydian augmented"],
        [
            "1P 2m 3m 4P 5P 6M 7m",
            "dorian b2",
            "phrygian #6",
            "melodic minor second mode",
        ],
        ["1P 2M 3m 4P 5P 6M 7M", "melodic minor"],
        ["1P 2m 3m 4P 5d 6m 7m", "locrian"],
        [
            "1P 2m 3m 4d 5d 6m 7d",
            "ultralocrian",
            "superlocrian bb7",
            "·superlocrian diminished",
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
            "ionian #5",
        ],
        ["1P 2A 3M 4A 5P 6M 7M", "lydian #9"],
        // 8-note scales
        ["1P 2m 2M 4P 4A 5P 6m 7M", "messiaen's mode #4"],
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
        [
            "1P 2m 3m 3M 4A 5P 6M 7m",
            "half-whole diminished",
            "dominant diminished",
            "messiaen's mode #2",
        ],
        ["1P 3m 3M 4P 5P 6M 7m 7M", "kafi raga"],
        ["1P 2M 3M 4P 4A 5A 6A 7M", "messiaen's mode #6"],
        // 9-note scales
        ["1P 2M 3m 3M 4P 5d 5P 6M 7m", "composite blues"],
        ["1P 2M 3m 3M 4A 5P 6m 7m 7M", "messiaen's mode #3"],
        // 10-note scales
        ["1P 2m 2M 3m 4P 4A 5P 6m 6M 7M", "messiaen's mode #7"],
        // 12-note scales
        ["1P 2m 2M 3m 3M 4P 5d 5P 6m 6M 7m 7M", "chromatic"],
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
        scaleType: scaleType,
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


},{"@tonaljs/core":8,"@tonaljs/pcset":15}],20:[function(require,module,exports){
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/chord-type'), require('@tonaljs/collection'), require('@tonaljs/core'), require('@tonaljs/note'), require('@tonaljs/pcset'), require('@tonaljs/scale-type')) :
    typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/chord-type', '@tonaljs/collection', '@tonaljs/core', '@tonaljs/note', '@tonaljs/pcset', '@tonaljs/scale-type'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Scale = {}, global.chordType, global.collection, global.core, global.note, global.pcset, global.scaleType));
}(this, (function (exports, chordType, collection, core, note, pcset, scaleType) { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
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

    var NoScale = {
        empty: true,
        name: "",
        type: "",
        tonic: null,
        setNum: NaN,
        chroma: "",
        normalized: "",
        aliases: [],
        notes: [],
        intervals: [],
    };
    /**
     * Given a string with a scale name and (optionally) a tonic, split
     * that components.
     *
     * It retuns an array with the form [ name, tonic ] where tonic can be a
     * note name or null and name can be any arbitrary string
     * (this function doesn"t check if that scale name exists)
     *
     * @function
     * @param {string} name - the scale name
     * @return {Array} an array [tonic, name]
     * @example
     * tokenize("C mixolydean") // => ["C", "mixolydean"]
     * tokenize("anything is valid") // => ["", "anything is valid"]
     * tokenize() // => ["", ""]
     */
    function tokenize(name) {
        if (typeof name !== "string") {
            return ["", ""];
        }
        var i = name.indexOf(" ");
        var tonic = core.note(name.substring(0, i));
        if (tonic.empty) {
            var n = core.note(name);
            return n.empty ? ["", name] : [n.name, ""];
        }
        var type = name.substring(tonic.name.length + 1);
        return [tonic.name, type.length ? type : ""];
    }
    /**
     * Get all scale names
     * @function
     */
    var names = scaleType.names;
    /**
     * Get a Scale from a scale name.
     */
    function get(src) {
        var tokens = Array.isArray(src) ? src : tokenize(src);
        var tonic = core.note(tokens[0]).name;
        var st = scaleType.get(tokens[1]);
        if (st.empty) {
            return NoScale;
        }
        var type = st.name;
        var notes = tonic
            ? st.intervals.map(function (i) { return core.transpose(tonic, i); })
            : [];
        var name = tonic ? tonic + " " + type : type;
        return __assign(__assign({}, st), { name: name, type: type, tonic: tonic, notes: notes });
    }
    var scale = core.deprecate("Scale.scale", "Scale.get", get);
    /**
     * Get all chords that fits a given scale
     *
     * @function
     * @param {string} name - the scale name
     * @return {Array<string>} - the chord names
     *
     * @example
     * scaleChords("pentatonic") // => ["5", "64", "M", "M6", "Madd9", "Msus2"]
     */
    function scaleChords(name) {
        var s = get(name);
        var inScale = pcset.isSubsetOf(s.chroma);
        return chordType.all()
            .filter(function (chord) { return inScale(chord.chroma); })
            .map(function (chord) { return chord.aliases[0]; });
    }
    /**
     * Get all scales names that are a superset of the given one
     * (has the same notes and at least one more)
     *
     * @function
     * @param {string} name
     * @return {Array} a list of scale names
     * @example
     * extended("major") // => ["bebop", "bebop dominant", "bebop major", "chromatic", "ichikosucho"]
     */
    function extended(name) {
        var s = get(name);
        var isSuperset = pcset.isSupersetOf(s.chroma);
        return scaleType.all()
            .filter(function (scale) { return isSuperset(scale.chroma); })
            .map(function (scale) { return scale.name; });
    }
    /**
     * Find all scales names that are a subset of the given one
     * (has less notes but all from the given scale)
     *
     * @function
     * @param {string} name
     * @return {Array} a list of scale names
     *
     * @example
     * reduced("major") // => ["ionian pentatonic", "major pentatonic", "ritusen"]
     */
    function reduced(name) {
        var isSubset = pcset.isSubsetOf(get(name).chroma);
        return scaleType.all()
            .filter(function (scale) { return isSubset(scale.chroma); })
            .map(function (scale) { return scale.name; });
    }
    /**
     * Given an array of notes, return the scale: a pitch class set starting from
     * the first note of the array
     *
     * @function
     * @param {string[]} notes
     * @return {string[]} pitch classes with same tonic
     * @example
     * scaleNotes(['C4', 'c3', 'C5', 'C4', 'c4']) // => ["C"]
     * scaleNotes(['D4', 'c#5', 'A5', 'F#6']) // => ["D", "F#", "A", "C#"]
     */
    function scaleNotes(notes) {
        var pcset = notes.map(function (n) { return core.note(n).pc; }).filter(function (x) { return x; });
        var tonic = pcset[0];
        var scale = note.sortedUniqNames(pcset);
        return collection.rotate(scale.indexOf(tonic), scale);
    }
    /**
     * Find mode names of a scale
     *
     * @function
     * @param {string} name - scale name
     * @example
     * modeNames("C pentatonic") // => [
     *   ["C", "major pentatonic"],
     *   ["D", "egyptian"],
     *   ["E", "malkos raga"],
     *   ["G", "ritusen"],
     *   ["A", "minor pentatonic"]
     * ]
     */
    function modeNames(name) {
        var s = get(name);
        if (s.empty) {
            return [];
        }
        var tonics = s.tonic ? s.notes : s.intervals;
        return pcset.modes(s.chroma)
            .map(function (chroma, i) {
            var modeName = get(chroma).name;
            return modeName ? [tonics[i], modeName] : ["", ""];
        })
            .filter(function (x) { return x[0]; });
    }
    function getNoteNameOf(scale) {
        var names = Array.isArray(scale) ? scaleNotes(scale) : get(scale).notes;
        var chromas = names.map(function (name) { return core.note(name).chroma; });
        return function (noteOrMidi) {
            var height = typeof noteOrMidi === "number" ? noteOrMidi : core.note(noteOrMidi).height;
            if (height === undefined)
                return undefined;
            var chroma = height % 12;
            var oct = Math.floor(height / 12) - 1;
            var position = chromas.indexOf(chroma);
            if (position === -1)
                return undefined;
            return names[position] + oct;
        };
    }
    function rangeOf(scale) {
        var getName = getNoteNameOf(scale);
        return function (fromNote, toNote) {
            var from = core.note(fromNote).height;
            var to = core.note(toNote).height;
            if (from === undefined || to === undefined)
                return [];
            return collection.range(from, to)
                .map(getName)
                .filter(function (x) { return x; });
        };
    }
    var index = {
        get: get,
        names: names,
        extended: extended,
        modeNames: modeNames,
        reduced: reduced,
        scaleChords: scaleChords,
        scaleNotes: scaleNotes,
        tokenize: tokenize,
        rangeOf: rangeOf,
        // deprecated
        scale: scale,
    };

    exports.default = index;
    exports.extended = extended;
    exports.get = get;
    exports.modeNames = modeNames;
    exports.names = names;
    exports.rangeOf = rangeOf;
    exports.reduced = reduced;
    exports.scale = scale;
    exports.scaleChords = scaleChords;
    exports.scaleNotes = scaleNotes;
    exports.tokenize = tokenize;

    Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/chord-type":5,"@tonaljs/collection":7,"@tonaljs/core":8,"@tonaljs/note":14,"@tonaljs/pcset":15,"@tonaljs/scale-type":19}],21:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = global || self, factory(global.TimeSignature = {}));
}(this, (function (exports) { 'use strict';

  // CONSTANTS
  var NONE = {
      empty: true,
      name: "",
      upper: undefined,
      lower: undefined,
      type: undefined,
      additive: [],
  };
  var NAMES = ["4/4", "3/4", "2/4", "2/2", "12/8", "9/8", "6/8", "3/8"];
  // PUBLIC API
  function names() {
      return NAMES.slice();
  }
  var REGEX = /^(\d?\d(?:\+\d)*)\/(\d)$/;
  var CACHE = new Map();
  function get(literal) {
      var cached = CACHE.get(literal);
      if (cached) {
          return cached;
      }
      var ts = build(parse(literal));
      CACHE.set(literal, ts);
      return ts;
  }
  function parse(literal) {
      if (typeof literal === "string") {
          var _a = REGEX.exec(literal) || [], _ = _a[0], up_1 = _a[1], low = _a[2];
          return parse([up_1, low]);
      }
      var up = literal[0], down = literal[1];
      var denominator = +down;
      if (typeof up === "number") {
          return [up, denominator];
      }
      var list = up.split("+").map(function (n) { return +n; });
      return list.length === 1 ? [list[0], denominator] : [list, denominator];
  }
  var index = { names: names, parse: parse, get: get };
  // PRIVATE
  function build(_a) {
      var up = _a[0], down = _a[1];
      var upper = Array.isArray(up) ? up.reduce(function (a, b) { return a + b; }, 0) : up;
      var lower = down;
      if (upper === 0 || lower === 0) {
          return NONE;
      }
      var name = Array.isArray(up) ? up.join("+") + "/" + down : up + "/" + down;
      var additive = Array.isArray(up) ? up : [];
      var type = lower === 4 || lower === 2
          ? "simple"
          : lower === 8 && upper % 3 === 0
              ? "compound"
              : "irregular";
      return {
          empty: false,
          name: name,
          type: type,
          upper: upper,
          lower: lower,
          additive: additive,
      };
  }

  exports.default = index;
  exports.get = get;
  exports.names = names;
  exports.parse = parse;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{}],22:[function(require,module,exports){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tonaljs/abc-notation'), require('@tonaljs/array'), require('@tonaljs/chord'), require('@tonaljs/chord-type'), require('@tonaljs/collection'), require('@tonaljs/core'), require('@tonaljs/duration-value'), require('@tonaljs/interval'), require('@tonaljs/key'), require('@tonaljs/midi'), require('@tonaljs/mode'), require('@tonaljs/note'), require('@tonaljs/pcset'), require('@tonaljs/progression'), require('@tonaljs/range'), require('@tonaljs/roman-numeral'), require('@tonaljs/scale'), require('@tonaljs/scale-type'), require('@tonaljs/time-signature')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tonaljs/abc-notation', '@tonaljs/array', '@tonaljs/chord', '@tonaljs/chord-type', '@tonaljs/collection', '@tonaljs/core', '@tonaljs/duration-value', '@tonaljs/interval', '@tonaljs/key', '@tonaljs/midi', '@tonaljs/mode', '@tonaljs/note', '@tonaljs/pcset', '@tonaljs/progression', '@tonaljs/range', '@tonaljs/roman-numeral', '@tonaljs/scale', '@tonaljs/scale-type', '@tonaljs/time-signature'], factory) :
  (global = global || self, factory(global.Tonal = {}, global.abcNotation, global.array, global.chord, global.ChordType, global.collection, global.Core, global.durationValue, global.interval, global.key, global.midi, global.mode, global.note, global.Pcset, global.progression, global.range, global.romanNumeral, global.scale, global.ScaleType, global.timeSignature));
}(this, (function (exports, abcNotation, array, chord, ChordType, collection, Core, durationValue, interval, key, midi, mode, note, Pcset, progression, range, romanNumeral, scale, ScaleType, timeSignature) { 'use strict';

  abcNotation = abcNotation && Object.prototype.hasOwnProperty.call(abcNotation, 'default') ? abcNotation['default'] : abcNotation;
  chord = chord && Object.prototype.hasOwnProperty.call(chord, 'default') ? chord['default'] : chord;
  ChordType = ChordType && Object.prototype.hasOwnProperty.call(ChordType, 'default') ? ChordType['default'] : ChordType;
  collection = collection && Object.prototype.hasOwnProperty.call(collection, 'default') ? collection['default'] : collection;
  durationValue = durationValue && Object.prototype.hasOwnProperty.call(durationValue, 'default') ? durationValue['default'] : durationValue;
  interval = interval && Object.prototype.hasOwnProperty.call(interval, 'default') ? interval['default'] : interval;
  key = key && Object.prototype.hasOwnProperty.call(key, 'default') ? key['default'] : key;
  midi = midi && Object.prototype.hasOwnProperty.call(midi, 'default') ? midi['default'] : midi;
  mode = mode && Object.prototype.hasOwnProperty.call(mode, 'default') ? mode['default'] : mode;
  note = note && Object.prototype.hasOwnProperty.call(note, 'default') ? note['default'] : note;
  Pcset = Pcset && Object.prototype.hasOwnProperty.call(Pcset, 'default') ? Pcset['default'] : Pcset;
  progression = progression && Object.prototype.hasOwnProperty.call(progression, 'default') ? progression['default'] : progression;
  range = range && Object.prototype.hasOwnProperty.call(range, 'default') ? range['default'] : range;
  romanNumeral = romanNumeral && Object.prototype.hasOwnProperty.call(romanNumeral, 'default') ? romanNumeral['default'] : romanNumeral;
  scale = scale && Object.prototype.hasOwnProperty.call(scale, 'default') ? scale['default'] : scale;
  ScaleType = ScaleType && Object.prototype.hasOwnProperty.call(ScaleType, 'default') ? ScaleType['default'] : ScaleType;
  timeSignature = timeSignature && Object.prototype.hasOwnProperty.call(timeSignature, 'default') ? timeSignature['default'] : timeSignature;

  // deprecated (backwards compatibility)
  var Tonal = Core;
  var PcSet = Pcset;
  var ChordDictionary = ChordType;
  var ScaleDictionary = ScaleType;

  Object.keys(Core).forEach(function (k) {
    if (k !== 'default') Object.defineProperty(exports, k, {
      enumerable: true,
      get: function () {
        return Core[k];
      }
    });
  });
  exports.AbcNotation = abcNotation;
  exports.Array = array;
  exports.Chord = chord;
  exports.ChordType = ChordType;
  exports.Collection = collection;
  exports.Core = Core;
  exports.DurationValue = durationValue;
  exports.Interval = interval;
  exports.Key = key;
  exports.Midi = midi;
  exports.Mode = mode;
  exports.Note = note;
  exports.Pcset = Pcset;
  exports.Progression = progression;
  exports.Range = range;
  exports.RomanNumeral = romanNumeral;
  exports.Scale = scale;
  exports.ScaleType = ScaleType;
  exports.TimeSignature = timeSignature;
  exports.ChordDictionary = ChordDictionary;
  exports.PcSet = PcSet;
  exports.ScaleDictionary = ScaleDictionary;
  exports.Tonal = Tonal;

  Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"@tonaljs/abc-notation":2,"@tonaljs/array":3,"@tonaljs/chord":6,"@tonaljs/chord-type":5,"@tonaljs/collection":7,"@tonaljs/core":8,"@tonaljs/duration-value":9,"@tonaljs/interval":10,"@tonaljs/key":11,"@tonaljs/midi":12,"@tonaljs/mode":13,"@tonaljs/note":14,"@tonaljs/pcset":15,"@tonaljs/progression":16,"@tonaljs/range":17,"@tonaljs/roman-numeral":18,"@tonaljs/scale":20,"@tonaljs/scale-type":19,"@tonaljs/time-signature":21}],23:[function(require,module,exports){
/*!
 * JavaScript Cookie v2.2.1
 * https://github.com/js-cookie/js-cookie
 *
 * Copyright 2006, 2015 Klaus Hartl & Fagner Brack
 * Released under the MIT license
 */
;(function (factory) {
	var registeredInModuleLoader;
	if (typeof define === 'function' && define.amd) {
		define(factory);
		registeredInModuleLoader = true;
	}
	if (typeof exports === 'object') {
		module.exports = factory();
		registeredInModuleLoader = true;
	}
	if (!registeredInModuleLoader) {
		var OldCookies = window.Cookies;
		var api = window.Cookies = factory();
		api.noConflict = function () {
			window.Cookies = OldCookies;
			return api;
		};
	}
}(function () {
	function extend () {
		var i = 0;
		var result = {};
		for (; i < arguments.length; i++) {
			var attributes = arguments[ i ];
			for (var key in attributes) {
				result[key] = attributes[key];
			}
		}
		return result;
	}

	function decode (s) {
		return s.replace(/(%[0-9A-Z]{2})+/g, decodeURIComponent);
	}

	function init (converter) {
		function api() {}

		function set (key, value, attributes) {
			if (typeof document === 'undefined') {
				return;
			}

			attributes = extend({
				path: '/'
			}, api.defaults, attributes);

			if (typeof attributes.expires === 'number') {
				attributes.expires = new Date(new Date() * 1 + attributes.expires * 864e+5);
			}

			// We're using "expires" because "max-age" is not supported by IE
			attributes.expires = attributes.expires ? attributes.expires.toUTCString() : '';

			try {
				var result = JSON.stringify(value);
				if (/^[\{\[]/.test(result)) {
					value = result;
				}
			} catch (e) {}

			value = converter.write ?
				converter.write(value, key) :
				encodeURIComponent(String(value))
					.replace(/%(23|24|26|2B|3A|3C|3E|3D|2F|3F|40|5B|5D|5E|60|7B|7D|7C)/g, decodeURIComponent);

			key = encodeURIComponent(String(key))
				.replace(/%(23|24|26|2B|5E|60|7C)/g, decodeURIComponent)
				.replace(/[\(\)]/g, escape);

			var stringifiedAttributes = '';
			for (var attributeName in attributes) {
				if (!attributes[attributeName]) {
					continue;
				}
				stringifiedAttributes += '; ' + attributeName;
				if (attributes[attributeName] === true) {
					continue;
				}

				// Considers RFC 6265 section 5.2:
				// ...
				// 3.  If the remaining unparsed-attributes contains a %x3B (";")
				//     character:
				// Consume the characters of the unparsed-attributes up to,
				// not including, the first %x3B (";") character.
				// ...
				stringifiedAttributes += '=' + attributes[attributeName].split(';')[0];
			}

			return (document.cookie = key + '=' + value + stringifiedAttributes);
		}

		function get (key, json) {
			if (typeof document === 'undefined') {
				return;
			}

			var jar = {};
			// To prevent the for loop in the first place assign an empty array
			// in case there are no cookies at all.
			var cookies = document.cookie ? document.cookie.split('; ') : [];
			var i = 0;

			for (; i < cookies.length; i++) {
				var parts = cookies[i].split('=');
				var cookie = parts.slice(1).join('=');

				if (!json && cookie.charAt(0) === '"') {
					cookie = cookie.slice(1, -1);
				}

				try {
					var name = decode(parts[0]);
					cookie = (converter.read || converter)(cookie, name) ||
						decode(cookie);

					if (json) {
						try {
							cookie = JSON.parse(cookie);
						} catch (e) {}
					}

					jar[name] = cookie;

					if (key === name) {
						break;
					}
				} catch (e) {}
			}

			return key ? jar[key] : jar;
		}

		api.set = set;
		api.get = function (key) {
			return get(key, false /* read as raw */);
		};
		api.getJSON = function (key) {
			return get(key, true /* read as json */);
		};
		api.remove = function (key, attributes) {
			set(key, '', extend(attributes, {
				expires: -1
			}));
		};

		api.defaults = {};

		api.withConverter = init;

		return api;
	}

	return init(function () {});
}));

},{}],24:[function(require,module,exports){
/*

WebMidi v2.5.3

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


!function(scope){"use strict";function WebMidi(){if(WebMidi.prototype._singleton)throw new Error("WebMidi is a singleton, it cannot be instantiated directly.");(WebMidi.prototype._singleton=this)._inputs=[],this._outputs=[],this._userHandlers={},this._stateChangeQueue=[],this._processingStateChange=!1,this._midiInterfaceEvents=["connected","disconnected"],this._nrpnBuffer=[[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]],this._nrpnEventsEnabled=!0,this._nrpnTypes=["entry","increment","decrement"],this._notes=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],this._semitones={C:0,D:2,E:4,F:5,G:7,A:9,B:11},Object.defineProperties(this,{MIDI_SYSTEM_MESSAGES:{value:{sysex:240,timecode:241,songposition:242,songselect:243,tuningrequest:246,sysexend:247,clock:248,start:250,continue:251,stop:252,activesensing:254,reset:255,midimessage:0,unknownsystemmessage:-1},writable:!1,enumerable:!0,configurable:!1},MIDI_CHANNEL_MESSAGES:{value:{noteoff:8,noteon:9,keyaftertouch:10,controlchange:11,channelmode:11,nrpn:11,programchange:12,channelaftertouch:13,pitchbend:14},writable:!1,enumerable:!0,configurable:!1},MIDI_REGISTERED_PARAMETER:{value:{pitchbendrange:[0,0],channelfinetuning:[0,1],channelcoarsetuning:[0,2],tuningprogram:[0,3],tuningbank:[0,4],modulationrange:[0,5],azimuthangle:[61,0],elevationangle:[61,1],gain:[61,2],distanceratio:[61,3],maximumdistance:[61,4],maximumdistancegain:[61,5],referencedistanceratio:[61,6],panspreadangle:[61,7],rollangle:[61,8]},writable:!1,enumerable:!0,configurable:!1},MIDI_CONTROL_CHANGE_MESSAGES:{value:{bankselectcoarse:0,modulationwheelcoarse:1,breathcontrollercoarse:2,footcontrollercoarse:4,portamentotimecoarse:5,dataentrycoarse:6,volumecoarse:7,balancecoarse:8,pancoarse:10,expressioncoarse:11,effectcontrol1coarse:12,effectcontrol2coarse:13,generalpurposeslider1:16,generalpurposeslider2:17,generalpurposeslider3:18,generalpurposeslider4:19,bankselectfine:32,modulationwheelfine:33,breathcontrollerfine:34,footcontrollerfine:36,portamentotimefine:37,dataentryfine:38,volumefine:39,balancefine:40,panfine:42,expressionfine:43,effectcontrol1fine:44,effectcontrol2fine:45,holdpedal:64,portamento:65,sustenutopedal:66,softpedal:67,legatopedal:68,hold2pedal:69,soundvariation:70,resonance:71,soundreleasetime:72,soundattacktime:73,brightness:74,soundcontrol6:75,soundcontrol7:76,soundcontrol8:77,soundcontrol9:78,soundcontrol10:79,generalpurposebutton1:80,generalpurposebutton2:81,generalpurposebutton3:82,generalpurposebutton4:83,reverblevel:91,tremololevel:92,choruslevel:93,celestelevel:94,phaserlevel:95,databuttonincrement:96,databuttondecrement:97,nonregisteredparametercoarse:98,nonregisteredparameterfine:99,registeredparametercoarse:100,registeredparameterfine:101},writable:!1,enumerable:!0,configurable:!1},MIDI_NRPN_MESSAGES:{value:{entrymsb:6,entrylsb:38,increment:96,decrement:97,paramlsb:98,parammsb:99,nullactiveparameter:127},writable:!1,enumerable:!0,configurable:!1},MIDI_CHANNEL_MODE_MESSAGES:{value:{allsoundoff:120,resetallcontrollers:121,localcontrol:122,allnotesoff:123,omnimodeoff:124,omnimodeon:125,monomodeon:126,polymodeon:127},writable:!1,enumerable:!0,configurable:!1},octaveOffset:{value:0,writable:!0,enumerable:!0,configurable:!1}}),Object.defineProperties(this,{supported:{enumerable:!0,get:function(){return"requestMIDIAccess"in navigator}},enabled:{enumerable:!0,get:function(){return void 0!==this.interface}.bind(this)},inputs:{enumerable:!0,get:function(){return this._inputs}.bind(this)},outputs:{enumerable:!0,get:function(){return this._outputs}.bind(this)},sysexEnabled:{enumerable:!0,get:function(){return!(!this.interface||!this.interface.sysexEnabled)}.bind(this)},nrpnEventsEnabled:{enumerable:!0,get:function(){return!!this._nrpnEventsEnabled}.bind(this),set:function(enabled){return this._nrpnEventsEnabled=enabled,this._nrpnEventsEnabled}},nrpnTypes:{enumerable:!0,get:function(){return this._nrpnTypes}.bind(this)},time:{enumerable:!0,get:function(){return performance.now()}}})}var wm=new WebMidi;function Input(midiInput){var that=this;this._userHandlers={channel:{},system:{}},this._midiInput=midiInput,Object.defineProperties(this,{connection:{enumerable:!0,get:function(){return that._midiInput.connection}},id:{enumerable:!0,get:function(){return that._midiInput.id}},manufacturer:{enumerable:!0,get:function(){return that._midiInput.manufacturer}},name:{enumerable:!0,get:function(){return that._midiInput.name}},state:{enumerable:!0,get:function(){return that._midiInput.state}},type:{enumerable:!0,get:function(){return that._midiInput.type}}}),this._initializeUserHandlers(),this._midiInput.onmidimessage=this._onMidiMessage.bind(this)}function Output(midiOutput){var that=this;this._midiOutput=midiOutput,Object.defineProperties(this,{connection:{enumerable:!0,get:function(){return that._midiOutput.connection}},id:{enumerable:!0,get:function(){return that._midiOutput.id}},manufacturer:{enumerable:!0,get:function(){return that._midiOutput.manufacturer}},name:{enumerable:!0,get:function(){return that._midiOutput.name}},state:{enumerable:!0,get:function(){return that._midiOutput.state}},type:{enumerable:!0,get:function(){return that._midiOutput.type}}})}WebMidi.prototype.enable=function(callback,sysex){this.enabled||(this.supported?navigator.requestMIDIAccess({sysex:sysex}).then(function(midiAccess){var promiseTimeout,events=[],promises=[];this.interface=midiAccess,this._resetInterfaceUserHandlers(),this.interface.onstatechange=function(e){events.push(e)};for(var inputs=midiAccess.inputs.values(),input=inputs.next();input&&!input.done;input=inputs.next())promises.push(input.value.open());for(var outputs=midiAccess.outputs.values(),output=outputs.next();output&&!output.done;output=outputs.next())promises.push(output.value.open());function onPortsOpen(){clearTimeout(promiseTimeout),this._updateInputsAndOutputs(),this.interface.onstatechange=this._onInterfaceStateChange.bind(this),"function"==typeof callback&&callback.call(this),events.forEach(function(event){this._onInterfaceStateChange(event)}.bind(this))}promiseTimeout=setTimeout(onPortsOpen.bind(this),200),Promise&&Promise.all(promises).catch(function(err){}).then(onPortsOpen.bind(this))}.bind(this),function(err){"function"==typeof callback&&callback.call(this,err)}.bind(this)):"function"==typeof callback&&callback(new Error("The Web MIDI API is not supported by your browser.")))},WebMidi.prototype.disable=function(){if(!this.supported)throw new Error("The Web MIDI API is not supported by your browser.");this.enabled&&(this.removeListener(),this.inputs.forEach(function(input){input.removeListener()})),this.interface&&(this.interface.onstatechange=void 0),this.interface=void 0,this._inputs=[],this._outputs=[],this._nrpnEventsEnabled=!0,this._resetInterfaceUserHandlers()},WebMidi.prototype.addListener=function(type,listener){if(!this.enabled)throw new Error("WebMidi must be enabled before adding event listeners.");if("function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(!(0<=this._midiInterfaceEvents.indexOf(type)))throw new TypeError("The specified event type is not supported.");return this._userHandlers[type].push(listener),this},WebMidi.prototype.hasListener=function(type,listener){if(!this.enabled)throw new Error("WebMidi must be enabled before checking event listeners.");if("function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(!(0<=this._midiInterfaceEvents.indexOf(type)))throw new TypeError("The specified event type is not supported.");for(var o=0;o<this._userHandlers[type].length;o++)if(this._userHandlers[type][o]===listener)return!0;return!1},WebMidi.prototype.removeListener=function(type,listener){if(!this.enabled)throw new Error("WebMidi must be enabled before removing event listeners.");if(void 0!==listener&&"function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(0<=this._midiInterfaceEvents.indexOf(type))if(listener)for(var o=0;o<this._userHandlers[type].length;o++)this._userHandlers[type][o]===listener&&this._userHandlers[type].splice(o,1);else this._userHandlers[type]=[];else{if(void 0!==type)throw new TypeError("The specified event type is not supported.");this._resetInterfaceUserHandlers()}return this},WebMidi.prototype.toMIDIChannels=function(channel){var channels;if("all"===channel||void 0===channel)channels=["all"];else{if("none"===channel)return channels=[];channels=Array.isArray(channel)?channel:[channel]}return-1<channels.indexOf("all")&&(channels=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]),channels.map(function(ch){return parseInt(ch)}).filter(function(ch){return 1<=ch&&ch<=16})},WebMidi.prototype.getInputById=function(id){if(!this.enabled)throw new Error("WebMidi is not enabled.");id=String(id);for(var i=0;i<this.inputs.length;i++)if(this.inputs[i].id===id)return this.inputs[i];return!1},WebMidi.prototype.getOutputById=function(id){if(!this.enabled)throw new Error("WebMidi is not enabled.");id=String(id);for(var i=0;i<this.outputs.length;i++)if(this.outputs[i].id===id)return this.outputs[i];return!1},WebMidi.prototype.getInputByName=function(name){if(!this.enabled)throw new Error("WebMidi is not enabled.");for(var i=0;i<this.inputs.length;i++)if(~this.inputs[i].name.indexOf(name))return this.inputs[i];return!1},WebMidi.prototype.getOctave=function(number){if(null!=number&&0<=number&&number<=127)return Math.floor(Math.floor(number)/12-1)+Math.floor(wm.octaveOffset)},WebMidi.prototype.getOutputByName=function(name){if(!this.enabled)throw new Error("WebMidi is not enabled.");for(var i=0;i<this.outputs.length;i++)if(~this.outputs[i].name.indexOf(name))return this.outputs[i];return!1},WebMidi.prototype.guessNoteNumber=function(input){var output=!1;if(input&&input.toFixed&&0<=input&&input<=127?output=Math.round(input):0<=parseInt(input)&&parseInt(input)<=127?output=parseInt(input):("string"==typeof input||input instanceof String)&&(output=this.noteNameToNumber(input)),!1===output)throw new Error("Invalid input value ("+input+").");return output},WebMidi.prototype.noteNameToNumber=function(name){"string"!=typeof name&&(name="");var matches=name.match(/([CDEFGAB])(#{0,2}|b{0,2})(-?\d+)/i);if(!matches)throw new RangeError("Invalid note name.");var semitones=wm._semitones[matches[1].toUpperCase()],result=12*(parseInt(matches[3])+1-Math.floor(wm.octaveOffset))+semitones;if(-1<matches[2].toLowerCase().indexOf("b")?result-=matches[2].length:-1<matches[2].toLowerCase().indexOf("#")&&(result+=matches[2].length),result<0||127<result)throw new RangeError("Invalid note name or note outside valid range.");return result},WebMidi.prototype._updateInputsAndOutputs=function(){this._updateInputs(),this._updateOutputs()},WebMidi.prototype._updateInputs=function(){for(var i=0;i<this._inputs.length;i++){for(var remove=!0,updated=this.interface.inputs.values(),input=updated.next();input&&!input.done;input=updated.next())if(this._inputs[i]._midiInput===input.value){remove=!1;break}remove&&this._inputs.splice(i,1)}this.interface&&this.interface.inputs.forEach(function(nInput){for(var add=!0,j=0;j<this._inputs.length;j++)this._inputs[j]._midiInput===nInput&&(add=!1);add&&this._inputs.push(new Input(nInput))}.bind(this))},WebMidi.prototype._updateOutputs=function(){for(var i=0;i<this._outputs.length;i++){for(var remove=!0,updated=this.interface.outputs.values(),output=updated.next();output&&!output.done;output=updated.next())if(this._outputs[i]._midiOutput===output.value){remove=!1;break}remove&&this._outputs.splice(i,1)}this.interface&&this.interface.outputs.forEach(function(nOutput){for(var add=!0,j=0;j<this._outputs.length;j++)this._outputs[j]._midiOutput===nOutput&&(add=!1);add&&this._outputs.push(new Output(nOutput))}.bind(this))},WebMidi.prototype._onInterfaceStateChange=function(e){this._updateInputsAndOutputs();var event={timestamp:e.timeStamp,type:e.port.state};this.interface&&"connected"===e.port.state?"output"===e.port.type?event.port=this.getOutputById(e.port.id):"input"===e.port.type&&(event.port=this.getInputById(e.port.id)):event.port={connection:"closed",id:e.port.id,manufacturer:e.port.manufacturer,name:e.port.name,state:e.port.state,type:e.port.type},this._userHandlers[e.port.state].forEach(function(handler){handler(event)})},WebMidi.prototype._resetInterfaceUserHandlers=function(){for(var i=0;i<this._midiInterfaceEvents.length;i++)this._userHandlers[this._midiInterfaceEvents[i]]=[]},Input.prototype.on=Input.prototype.addListener=function(type,channel,listener){var that=this;if(void 0===channel&&(channel="all"),Array.isArray(channel)||(channel=[channel]),channel.forEach(function(item){if("all"!==item&&!(1<=item&&item<=16))throw new RangeError("The 'channel' parameter is invalid.")}),"function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(void 0!==wm.MIDI_SYSTEM_MESSAGES[type])this._userHandlers.system[type]||(this._userHandlers.system[type]=[]),this._userHandlers.system[type].push(listener);else{if(void 0===wm.MIDI_CHANNEL_MESSAGES[type])throw new TypeError("The specified event type is not supported.");if(-1<channel.indexOf("all")){channel=[];for(var j=1;j<=16;j++)channel.push(j)}this._userHandlers.channel[type]||(this._userHandlers.channel[type]=[]),channel.forEach(function(ch){that._userHandlers.channel[type][ch]||(that._userHandlers.channel[type][ch]=[]),that._userHandlers.channel[type][ch].push(listener)})}return this},Input.prototype.hasListener=function(type,channel,listener){var that=this;if("function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(void 0===channel&&(channel="all"),channel.constructor!==Array&&(channel=[channel]),void 0!==wm.MIDI_SYSTEM_MESSAGES[type]){for(var o=0;o<this._userHandlers.system[type].length;o++)if(this._userHandlers.system[type][o]===listener)return!0}else if(void 0!==wm.MIDI_CHANNEL_MESSAGES[type]){if(-1<channel.indexOf("all")){channel=[];for(var j=1;j<=16;j++)channel.push(j)}return!!this._userHandlers.channel[type]&&channel.every(function(chNum){var listeners=that._userHandlers.channel[type][chNum];return listeners&&-1<listeners.indexOf(listener)})}return!1},Input.prototype.removeListener=function(type,channel,listener){var that=this;if(void 0!==listener&&"function"!=typeof listener)throw new TypeError("The 'listener' parameter must be a function.");if(void 0===channel&&(channel="all"),channel.constructor!==Array&&(channel=[channel]),void 0!==wm.MIDI_SYSTEM_MESSAGES[type])if(void 0===listener)this._userHandlers.system[type]=[];else for(var o=0;o<this._userHandlers.system[type].length;o++)this._userHandlers.system[type][o]===listener&&this._userHandlers.system[type].splice(o,1);else if(void 0!==wm.MIDI_CHANNEL_MESSAGES[type]){if(-1<channel.indexOf("all")){channel=[];for(var j=1;j<=16;j++)channel.push(j)}if(!this._userHandlers.channel[type])return this;channel.forEach(function(chNum){var listeners=that._userHandlers.channel[type][chNum];if(listeners)if(void 0===listener)that._userHandlers.channel[type][chNum]=[];else for(var l=0;l<listeners.length;l++)listeners[l]===listener&&listeners.splice(l,1)})}else{if(void 0!==type)throw new TypeError("The specified event type is not supported.");this._initializeUserHandlers()}return this},Input.prototype._initializeUserHandlers=function(){for(var prop1 in wm.MIDI_CHANNEL_MESSAGES)Object.prototype.hasOwnProperty.call(wm.MIDI_CHANNEL_MESSAGES,prop1)&&(this._userHandlers.channel[prop1]={});for(var prop2 in wm.MIDI_SYSTEM_MESSAGES)Object.prototype.hasOwnProperty.call(wm.MIDI_SYSTEM_MESSAGES,prop2)&&(this._userHandlers.system[prop2]=[])},Input.prototype._onMidiMessage=function(e){if(0<this._userHandlers.system.midimessage.length){var event={target:this,data:e.data,timestamp:e.timeStamp,type:"midimessage"};this._userHandlers.system.midimessage.forEach(function(callback){callback(event)})}e.data[0]<240?(this._parseChannelEvent(e),this._parseNrpnEvent(e)):e.data[0]<=255&&this._parseSystemEvent(e)},Input.prototype._parseNrpnEvent=function(e){var data1,data2,command=e.data[0]>>4,channelBufferIndex=15&e.data[0],channel=1+channelBufferIndex;if(1<e.data.length&&(data1=e.data[1],data2=2<e.data.length?e.data[2]:void 0),wm.nrpnEventsEnabled&&command===wm.MIDI_CHANNEL_MESSAGES.controlchange&&(data1>=wm.MIDI_NRPN_MESSAGES.increment&&data1<=wm.MIDI_NRPN_MESSAGES.parammsb||data1===wm.MIDI_NRPN_MESSAGES.entrymsb||data1===wm.MIDI_NRPN_MESSAGES.entrylsb)){var ccEvent={target:this,type:"controlchange",data:e.data,timestamp:e.timeStamp,channel:channel,controller:{number:data1,name:this.getCcNameByNumber(data1)},value:data2};if(ccEvent.controller.number===wm.MIDI_NRPN_MESSAGES.parammsb&&ccEvent.value!=wm.MIDI_NRPN_MESSAGES.nullactiveparameter)wm._nrpnBuffer[channelBufferIndex]=[],wm._nrpnBuffer[channelBufferIndex][0]=ccEvent;else if(1===wm._nrpnBuffer[channelBufferIndex].length&&ccEvent.controller.number===wm.MIDI_NRPN_MESSAGES.paramlsb)wm._nrpnBuffer[channelBufferIndex].push(ccEvent);else if(2!==wm._nrpnBuffer[channelBufferIndex].length||ccEvent.controller.number!==wm.MIDI_NRPN_MESSAGES.increment&&ccEvent.controller.number!==wm.MIDI_NRPN_MESSAGES.decrement&&ccEvent.controller.number!==wm.MIDI_NRPN_MESSAGES.entrymsb)if(3===wm._nrpnBuffer[channelBufferIndex].length&&wm._nrpnBuffer[channelBufferIndex][2].number===wm.MIDI_NRPN_MESSAGES.entrymsb&&ccEvent.controller.number===wm.MIDI_NRPN_MESSAGES.entrylsb)wm._nrpnBuffer[channelBufferIndex].push(ccEvent);else if(3<=wm._nrpnBuffer[channelBufferIndex].length&&wm._nrpnBuffer[channelBufferIndex].length<=4&&ccEvent.controller.number===wm.MIDI_NRPN_MESSAGES.parammsb&&ccEvent.value===wm.MIDI_NRPN_MESSAGES.nullactiveparameter)wm._nrpnBuffer[channelBufferIndex].push(ccEvent);else if(4<=wm._nrpnBuffer[channelBufferIndex].length&&wm._nrpnBuffer[channelBufferIndex].length<=5&&ccEvent.controller.number===wm.MIDI_NRPN_MESSAGES.paramlsb&&ccEvent.value===wm.MIDI_NRPN_MESSAGES.nullactiveparameter){wm._nrpnBuffer[channelBufferIndex].push(ccEvent);var rawData=[];wm._nrpnBuffer[channelBufferIndex].forEach(function(ev){rawData.push(ev.data)});var nrpnNumber=wm._nrpnBuffer[channelBufferIndex][0].value<<7|wm._nrpnBuffer[channelBufferIndex][1].value,nrpnValue=wm._nrpnBuffer[channelBufferIndex][2].value;6===wm._nrpnBuffer[channelBufferIndex].length&&(nrpnValue=wm._nrpnBuffer[channelBufferIndex][2].value<<7|wm._nrpnBuffer[channelBufferIndex][3].value);var nrpnControllerType="";switch(wm._nrpnBuffer[channelBufferIndex][2].controller.number){case wm.MIDI_NRPN_MESSAGES.entrymsb:nrpnControllerType=wm._nrpnTypes[0];break;case wm.MIDI_NRPN_MESSAGES.increment:nrpnControllerType=wm._nrpnTypes[1];break;case wm.MIDI_NRPN_MESSAGES.decrement:nrpnControllerType=wm._nrpnTypes[2];break;default:throw new Error("The NPRN type was unidentifiable.")}var nrpnEvent={timestamp:ccEvent.timestamp,channel:ccEvent.channel,type:"nrpn",data:rawData,controller:{number:nrpnNumber,type:nrpnControllerType,name:"Non-Registered Parameter "+nrpnNumber},value:nrpnValue};wm._nrpnBuffer[channelBufferIndex]=[],this._userHandlers.channel[nrpnEvent.type]&&this._userHandlers.channel[nrpnEvent.type][nrpnEvent.channel]&&this._userHandlers.channel[nrpnEvent.type][nrpnEvent.channel].forEach(function(callback){callback(nrpnEvent)})}else wm._nrpnBuffer[channelBufferIndex]=[];else wm._nrpnBuffer[channelBufferIndex].push(ccEvent)}},Input.prototype._parseChannelEvent=function(e){var data1,data2,command=e.data[0]>>4,channel=1+(15&e.data[0]);1<e.data.length&&(data1=e.data[1],data2=2<e.data.length?e.data[2]:void 0);var event={target:this,data:e.data,timestamp:e.timeStamp,channel:channel};command===wm.MIDI_CHANNEL_MESSAGES.noteoff||command===wm.MIDI_CHANNEL_MESSAGES.noteon&&0===data2?(event.type="noteoff",event.note={number:data1,name:wm._notes[data1%12],octave:wm.getOctave(data1)},event.velocity=data2/127,event.rawVelocity=data2):command===wm.MIDI_CHANNEL_MESSAGES.noteon?(event.type="noteon",event.note={number:data1,name:wm._notes[data1%12],octave:wm.getOctave(data1)},event.velocity=data2/127,event.rawVelocity=data2):command===wm.MIDI_CHANNEL_MESSAGES.keyaftertouch?(event.type="keyaftertouch",event.note={number:data1,name:wm._notes[data1%12],octave:wm.getOctave(data1)},event.value=data2/127):command===wm.MIDI_CHANNEL_MESSAGES.controlchange&&0<=data1&&data1<=119?(event.type="controlchange",event.controller={number:data1,name:this.getCcNameByNumber(data1)},event.value=data2):command===wm.MIDI_CHANNEL_MESSAGES.channelmode&&120<=data1&&data1<=127?(event.type="channelmode",event.controller={number:data1,name:this.getChannelModeByNumber(data1)},event.value=data2):command===wm.MIDI_CHANNEL_MESSAGES.programchange?(event.type="programchange",event.value=data1):command===wm.MIDI_CHANNEL_MESSAGES.channelaftertouch?(event.type="channelaftertouch",event.value=data1/127):command===wm.MIDI_CHANNEL_MESSAGES.pitchbend?(event.type="pitchbend",event.value=((data2<<7)+data1-8192)/8192):event.type="unknownchannelmessage",this._userHandlers.channel[event.type]&&this._userHandlers.channel[event.type][channel]&&this._userHandlers.channel[event.type][channel].forEach(function(callback){callback(event)})},Input.prototype.getCcNameByNumber=function(number){if(!(0<=(number=Math.floor(number))&&number<=119))throw new RangeError("The control change number must be between 0 and 119.");for(var cc in wm.MIDI_CONTROL_CHANGE_MESSAGES)if(Object.prototype.hasOwnProperty.call(wm.MIDI_CONTROL_CHANGE_MESSAGES,cc)&&number===wm.MIDI_CONTROL_CHANGE_MESSAGES[cc])return cc},Input.prototype.getChannelModeByNumber=function(number){if(!(120<=(number=Math.floor(number))&&status<=127))throw new RangeError("The control change number must be between 120 and 127.");for(var cm in wm.MIDI_CHANNEL_MODE_MESSAGES)if(Object.prototype.hasOwnProperty.call(wm.MIDI_CHANNEL_MODE_MESSAGES,cm)&&number===wm.MIDI_CHANNEL_MODE_MESSAGES[cm])return cm},Input.prototype._parseSystemEvent=function(e){var command=e.data[0],event={target:this,data:e.data,timestamp:e.timeStamp};command===wm.MIDI_SYSTEM_MESSAGES.sysex?event.type="sysex":command===wm.MIDI_SYSTEM_MESSAGES.timecode?event.type="timecode":command===wm.MIDI_SYSTEM_MESSAGES.songposition?event.type="songposition":command===wm.MIDI_SYSTEM_MESSAGES.songselect?(event.type="songselect",event.song=e.data[1]):command===wm.MIDI_SYSTEM_MESSAGES.tuningrequest?event.type="tuningrequest":command===wm.MIDI_SYSTEM_MESSAGES.clock?event.type="clock":command===wm.MIDI_SYSTEM_MESSAGES.start?event.type="start":command===wm.MIDI_SYSTEM_MESSAGES.continue?event.type="continue":command===wm.MIDI_SYSTEM_MESSAGES.stop?event.type="stop":command===wm.MIDI_SYSTEM_MESSAGES.activesensing?event.type="activesensing":command===wm.MIDI_SYSTEM_MESSAGES.reset?event.type="reset":event.type="unknownsystemmessage",this._userHandlers.system[event.type]&&this._userHandlers.system[event.type].forEach(function(callback){callback(event)})},Output.prototype.send=function(status,data,timestamp){if(!(128<=status&&status<=255))throw new RangeError("The status byte must be an integer between 128 (0x80) and 255 (0xFF).");void 0===data&&(data=[]),Array.isArray(data)||(data=[data]);var message=[];return data.forEach(function(item){var parsed=Math.floor(item);if(!(0<=parsed&&parsed<=255))throw new RangeError("Data bytes must be integers between 0 (0x00) and 255 (0xFF).");message.push(parsed)}),this._midiOutput.send([status].concat(message),parseFloat(timestamp)||0),this},Output.prototype.sendSysex=function(manufacturer,data,options){if(!wm.sysexEnabled)throw new Error("Sysex message support must first be activated.");return options=options||{},manufacturer=[].concat(manufacturer),data.forEach(function(item){if(item<0||127<item)throw new RangeError("The data bytes of a sysex message must be integers between 0 (0x00) and 127 (0x7F).")}),data=manufacturer.concat(data,wm.MIDI_SYSTEM_MESSAGES.sysexend),this.send(wm.MIDI_SYSTEM_MESSAGES.sysex,data,this._parseTimeParameter(options.time)),this},Output.prototype.sendTimecodeQuarterFrame=function(value,options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.timecode,value,this._parseTimeParameter(options.time)),this},Output.prototype.sendSongPosition=function(value,options){options=options||{};var msb=(value=Math.floor(value)||0)>>7&127,lsb=127&value;return this.send(wm.MIDI_SYSTEM_MESSAGES.songposition,[msb,lsb],this._parseTimeParameter(options.time)),this},Output.prototype.sendSongSelect=function(value,options){if(options=options||{},!(0<=(value=Math.floor(value))&&value<=127))throw new RangeError("The song number must be between 0 and 127.");return this.send(wm.MIDI_SYSTEM_MESSAGES.songselect,[value],this._parseTimeParameter(options.time)),this},Output.prototype.sendTuningRequest=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.tuningrequest,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.sendClock=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.clock,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.sendStart=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.start,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.sendContinue=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.continue,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.sendStop=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.stop,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.sendActiveSensing=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.activesensing,[],this._parseTimeParameter(options.time)),this},Output.prototype.sendReset=function(options){return options=options||{},this.send(wm.MIDI_SYSTEM_MESSAGES.reset,void 0,this._parseTimeParameter(options.time)),this},Output.prototype.stopNote=function(note,channel,options){if("all"===note)return this.sendChannelMode("allnotesoff",0,channel,options);var nVelocity=64;return(options=options||{}).rawVelocity?!isNaN(options.velocity)&&0<=options.velocity&&options.velocity<=127&&(nVelocity=options.velocity):!isNaN(options.velocity)&&0<=options.velocity&&options.velocity<=1&&(nVelocity=127*options.velocity),this._convertNoteToArray(note).forEach(function(item){wm.toMIDIChannels(channel).forEach(function(ch){this.send((wm.MIDI_CHANNEL_MESSAGES.noteoff<<4)+(ch-1),[item,Math.round(nVelocity)],this._parseTimeParameter(options.time))}.bind(this))}.bind(this)),this},Output.prototype.playNote=function(note,channel,options){var time,nVelocity=64;if((options=options||{}).rawVelocity?!isNaN(options.velocity)&&0<=options.velocity&&options.velocity<=127&&(nVelocity=options.velocity):!isNaN(options.velocity)&&0<=options.velocity&&options.velocity<=1&&(nVelocity=127*options.velocity),time=this._parseTimeParameter(options.time),this._convertNoteToArray(note).forEach(function(item){wm.toMIDIChannels(channel).forEach(function(ch){this.send((wm.MIDI_CHANNEL_MESSAGES.noteon<<4)+(ch-1),[item,Math.round(nVelocity)],time)}.bind(this))}.bind(this)),!isNaN(options.duration)){options.duration<=0&&(options.duration=0);var nRelease=64;options.rawVelocity?!isNaN(options.release)&&0<=options.release&&options.release<=127&&(nRelease=options.release):!isNaN(options.release)&&0<=options.release&&options.release<=1&&(nRelease=127*options.release),this._convertNoteToArray(note).forEach(function(item){wm.toMIDIChannels(channel).forEach(function(ch){this.send((wm.MIDI_CHANNEL_MESSAGES.noteoff<<4)+(ch-1),[item,Math.round(nRelease)],(time||wm.time)+options.duration)}.bind(this))}.bind(this))}return this},Output.prototype.sendKeyAftertouch=function(note,channel,pressure,options){var that=this;if(options=options||{},channel<1||16<channel)throw new RangeError("The channel must be between 1 and 16.");(isNaN(pressure)||pressure<0||1<pressure)&&(pressure=.5);var nPressure=Math.round(127*pressure);return this._convertNoteToArray(note).forEach(function(item){wm.toMIDIChannels(channel).forEach(function(ch){that.send((wm.MIDI_CHANNEL_MESSAGES.keyaftertouch<<4)+(ch-1),[item,nPressure],that._parseTimeParameter(options.time))})}),this},Output.prototype.sendControlChange=function(controller,value,channel,options){if(options=options||{},"string"==typeof controller){if(void 0===(controller=wm.MIDI_CONTROL_CHANGE_MESSAGES[controller]))throw new TypeError("Invalid controller name.")}else if(!(0<=(controller=Math.floor(controller))&&controller<=119))throw new RangeError("Controller numbers must be between 0 and 119.");if(!(0<=(value=Math.floor(value)||0)&&value<=127))throw new RangeError("Controller value must be between 0 and 127.");return wm.toMIDIChannels(channel).forEach(function(ch){this.send((wm.MIDI_CHANNEL_MESSAGES.controlchange<<4)+(ch-1),[controller,value],this._parseTimeParameter(options.time))}.bind(this)),this},Output.prototype._selectRegisteredParameter=function(parameter,channel,time){var that=this;if(parameter[0]=Math.floor(parameter[0]),!(0<=parameter[0]&&parameter[0]<=127))throw new RangeError("The control65 value must be between 0 and 127");if(parameter[1]=Math.floor(parameter[1]),!(0<=parameter[1]&&parameter[1]<=127))throw new RangeError("The control64 value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.sendControlChange(101,parameter[0],channel,{time:time}),that.sendControlChange(100,parameter[1],channel,{time:time})}),this},Output.prototype._selectNonRegisteredParameter=function(parameter,channel,time){var that=this;if(parameter[0]=Math.floor(parameter[0]),!(0<=parameter[0]&&parameter[0]<=127))throw new RangeError("The control63 value must be between 0 and 127");if(parameter[1]=Math.floor(parameter[1]),!(0<=parameter[1]&&parameter[1]<=127))throw new RangeError("The control62 value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.sendControlChange(99,parameter[0],channel,{time:time}),that.sendControlChange(98,parameter[1],channel,{time:time})}),this},Output.prototype._setCurrentRegisteredParameter=function(data,channel,time){var that=this;if((data=[].concat(data))[0]=Math.floor(data[0]),!(0<=data[0]&&data[0]<=127))throw new RangeError("The msb value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.sendControlChange(6,data[0],channel,{time:time})}),data[1]=Math.floor(data[1]),0<=data[1]&&data[1]<=127&&wm.toMIDIChannels(channel).forEach(function(){that.sendControlChange(38,data[1],channel,{time:time})}),this},Output.prototype._deselectRegisteredParameter=function(channel,time){var that=this;return wm.toMIDIChannels(channel).forEach(function(){that.sendControlChange(101,127,channel,{time:time}),that.sendControlChange(100,127,channel,{time:time})}),this},Output.prototype.setRegisteredParameter=function(parameter,data,channel,options){var that=this;if(options=options||{},!Array.isArray(parameter)){if(!wm.MIDI_REGISTERED_PARAMETER[parameter])throw new Error("The specified parameter is not available.");parameter=wm.MIDI_REGISTERED_PARAMETER[parameter]}return wm.toMIDIChannels(channel).forEach(function(){that._selectRegisteredParameter(parameter,channel,options.time),that._setCurrentRegisteredParameter(data,channel,options.time),that._deselectRegisteredParameter(channel,options.time)}),this},Output.prototype.setNonRegisteredParameter=function(parameter,data,channel,options){var that=this;if(options=options||{},!(0<=parameter[0]&&parameter[0]<=127&&0<=parameter[1]&&parameter[1]<=127))throw new Error("Position 0 and 1 of the 2-position parameter array must both be between 0 and 127.");return data=[].concat(data),wm.toMIDIChannels(channel).forEach(function(){that._selectNonRegisteredParameter(parameter,channel,options.time),that._setCurrentRegisteredParameter(data,channel,options.time),that._deselectRegisteredParameter(channel,options.time)}),this},Output.prototype.incrementRegisteredParameter=function(parameter,channel,options){var that=this;if(options=options||{},!Array.isArray(parameter)){if(!wm.MIDI_REGISTERED_PARAMETER[parameter])throw new Error("The specified parameter is not available.");parameter=wm.MIDI_REGISTERED_PARAMETER[parameter]}return wm.toMIDIChannels(channel).forEach(function(){that._selectRegisteredParameter(parameter,channel,options.time),that.sendControlChange(96,0,channel,{time:options.time}),that._deselectRegisteredParameter(channel,options.time)}),this},Output.prototype.decrementRegisteredParameter=function(parameter,channel,options){if(options=options||{},!Array.isArray(parameter)){if(!wm.MIDI_REGISTERED_PARAMETER[parameter])throw new TypeError("The specified parameter is not available.");parameter=wm.MIDI_REGISTERED_PARAMETER[parameter]}return wm.toMIDIChannels(channel).forEach(function(){this._selectRegisteredParameter(parameter,channel,options.time),this.sendControlChange(97,0,channel,{time:options.time}),this._deselectRegisteredParameter(channel,options.time)}.bind(this)),this},Output.prototype.setPitchBendRange=function(semitones,cents,channel,options){var that=this;if(options=options||{},!(0<=(semitones=Math.floor(semitones)||0)&&semitones<=127))throw new RangeError("The semitones value must be between 0 and 127");if(!(0<=(cents=Math.floor(cents)||0)&&cents<=127))throw new RangeError("The cents value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.setRegisteredParameter("pitchbendrange",[semitones,cents],channel,{time:options.time})}),this},Output.prototype.setModulationRange=function(semitones,cents,channel,options){var that=this;if(options=options||{},!(0<=(semitones=Math.floor(semitones)||0)&&semitones<=127))throw new RangeError("The semitones value must be between 0 and 127");if(!(0<=(cents=Math.floor(cents)||0)&&cents<=127))throw new RangeError("The cents value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.setRegisteredParameter("modulationrange",[semitones,cents],channel,{time:options.time})}),this},Output.prototype.setMasterTuning=function(value,channel,options){var that=this;if(options=options||{},(value=parseFloat(value)||0)<=-65||64<=value)throw new RangeError("The value must be a decimal number larger than -65 and smaller than 64.");var coarse=Math.floor(value)+64,fine=value-Math.floor(value),msb=(fine=Math.round((fine+1)/2*16383))>>7&127,lsb=127&fine;return wm.toMIDIChannels(channel).forEach(function(){that.setRegisteredParameter("channelcoarsetuning",coarse,channel,{time:options.time}),that.setRegisteredParameter("channelfinetuning",[msb,lsb],channel,{time:options.time})}),this},Output.prototype.setTuningProgram=function(value,channel,options){var that=this;if(options=options||{},!(0<=(value=Math.floor(value))&&value<=127))throw new RangeError("The program value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.setRegisteredParameter("tuningprogram",value,channel,{time:options.time})}),this},Output.prototype.setTuningBank=function(value,channel,options){var that=this;if(options=options||{},!(0<=(value=Math.floor(value)||0)&&value<=127))throw new RangeError("The bank value must be between 0 and 127");return wm.toMIDIChannels(channel).forEach(function(){that.setRegisteredParameter("tuningbank",value,channel,{time:options.time})}),this},Output.prototype.sendChannelMode=function(command,value,channel,options){if(options=options||{},"string"==typeof command){if(!(command=wm.MIDI_CHANNEL_MODE_MESSAGES[command]))throw new TypeError("Invalid channel mode message name.")}else if(!(120<=(command=Math.floor(command))&&command<=127))throw new RangeError("Channel mode numerical identifiers must be between 120 and 127.");if((value=Math.floor(value)||0)<0||127<value)throw new RangeError("Value must be an integer between 0 and 127.");return wm.toMIDIChannels(channel).forEach(function(ch){this.send((wm.MIDI_CHANNEL_MESSAGES.channelmode<<4)+(ch-1),[command,value],this._parseTimeParameter(options.time))}.bind(this)),this},Output.prototype.sendProgramChange=function(program,channel,options){var that=this;if(options=options||{},program=Math.floor(program),isNaN(program)||program<0||127<program)throw new RangeError("Program numbers must be between 0 and 127.");return wm.toMIDIChannels(channel).forEach(function(ch){that.send((wm.MIDI_CHANNEL_MESSAGES.programchange<<4)+(ch-1),[program],that._parseTimeParameter(options.time))}),this},Output.prototype.sendChannelAftertouch=function(pressure,channel,options){var that=this;options=options||{},pressure=parseFloat(pressure),(isNaN(pressure)||pressure<0||1<pressure)&&(pressure=.5);var nPressure=Math.round(127*pressure);return wm.toMIDIChannels(channel).forEach(function(ch){that.send((wm.MIDI_CHANNEL_MESSAGES.channelaftertouch<<4)+(ch-1),[nPressure],that._parseTimeParameter(options.time))}),this},Output.prototype.sendPitchBend=function(bend,channel,options){var that=this;if(options=options||{},isNaN(bend)||bend<-1||1<bend)throw new RangeError("Pitch bend value must be between -1 and 1.");var nLevel=Math.round((bend+1)/2*16383),msb=nLevel>>7&127,lsb=127&nLevel;return wm.toMIDIChannels(channel).forEach(function(ch){that.send((wm.MIDI_CHANNEL_MESSAGES.pitchbend<<4)+(ch-1),[lsb,msb],that._parseTimeParameter(options.time))}),this},Output.prototype._parseTimeParameter=function(time){var value,parsed=parseFloat(time);return"string"==typeof time&&"+"===time.substring(0,1)?parsed&&0<parsed&&(value=wm.time+parsed):parsed>wm.time&&(value=parsed),value},Output.prototype._convertNoteToArray=function(note){var notes=[];return Array.isArray(note)||(note=[note]),note.forEach(function(item){notes.push(wm.guessNoteNumber(item))}),notes},"function"==typeof define&&"object"==typeof define.amd?define([],function(){return wm}):"undefined"!=typeof module&&module.exports?module.exports=wm:scope.WebMidi||(scope.WebMidi=wm)}(this);
},{}],"nexusui":[function(require,module,exports){
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["Nexus"] = factory();
	else
		root["Nexus"] = factory();
})(this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;
/******/
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };
	
	var NexusUI = _interopRequire(__webpack_require__(1));
	
	module.exports = NexusUI;

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequireWildcard = function (obj) { return obj && obj.__esModule ? obj : { "default": obj }; };
	
	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	exports.colors = colors;
	exports.context = context;
	exports.clock = clock;
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	"use strict";
	
	var Interfaces = _interopRequire(__webpack_require__(2));
	
	var math = _interopRequire(__webpack_require__(5));
	
	var Rack = _interopRequire(__webpack_require__(38));
	
	var Tune = _interopRequire(__webpack_require__(40));
	
	var Transform = _interopRequireWildcard(__webpack_require__(39));
	
	var Counter = __webpack_require__(28);
	var Radio = __webpack_require__(41);
	var Drunk = __webpack_require__(27);
	var Sequence = __webpack_require__(26);
	var Matrix = __webpack_require__(25);
	
	var WAAClock = _interopRequire(__webpack_require__(42));
	
	var Interval = _interopRequire(__webpack_require__(29));
	
	/**
	NexusUI => created as Nexus
	*/
	
	var NexusUI = (function () {
	  function NexusUI(context) {
	    _classCallCheck(this, NexusUI);
	
	    for (var key in Interfaces) {
	      this[key] = Interfaces[key];
	    }
	
	    for (var key in math) {
	      this[key] = math[key];
	    }
	
	    var Core = {
	      Rack: Rack
	    };
	
	    var Models = {
	      Counter: Counter,
	      Radio: Radio,
	      Drunk: Drunk,
	      Sequence: Sequence,
	      Matrix: Matrix
	    };
	
	    for (var key in Models) {
	      this[key] = Models[key];
	    }
	
	    for (var key in Core) {
	      this[key] = Core[key];
	    }
	
	    var DefaultContext = window.AudioContext || window.webkitAudioContext;
	    this._context = context || new DefaultContext();
	
	    this.tune = new Tune();
	    this.note = this.tune.note.bind(this.tune);
	
	    this.clock = new WAAClock(this._context);
	    this.clock.start();
	    this.Interval = Interval;
	
	    this.colors = {
	      accent: "#2bb",
	      fill: "#eee",
	      light: "#fff",
	      dark: "#333",
	      mediumLight: "#ccc",
	      mediumDark: "#666"
	    };
	
	    this.transform = Transform;
	    this.add = Transform.add;
	
	    this.Add = {};
	    for (var key in Interfaces) {
	      this.Add[key] = Transform.add.bind(this, key);
	    }
	
	    /* create default component size as 1st style element in document */
	    var defaultStyleNode = document.createElement("style");
	    defaultStyleNode.type = "text/css";
	    defaultStyleNode.innerHTML = "[nexus-ui]{height:5000px;width:5000px}";
	    var h = document.head;
	    h.insertBefore(defaultStyleNode, h.firstElementChild);
	  }
	
	  _createClass(NexusUI, {
	    context: {
	      get: function () {
	        return this._context;
	      },
	      set: function (ctx) {
	        this.clock.stop();
	        this._context = ctx;
	        this.clock = new WAAClock(this.context);
	        this.clock.start();
	      }
	    }
	  });
	
	  return NexusUI;
	})();
	
	var Nexus = new NexusUI();
	
	function colors() {
	  return Nexus.colors;
	}
	
	function context() {
	  return Nexus.context;
	}
	
	function clock() {
	  return Nexus.clock;
	}
	
	exports["default"] = Nexus;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	module.exports = {
	  Position: __webpack_require__(3),
	  Slider: __webpack_require__(14),
	  Toggle: __webpack_require__(15),
	  /*  Range: require('./rangeslider'),
	    Waveform: require('./waveform'), */
	  Button: __webpack_require__(16),
	  TextButton: __webpack_require__(18),
	  RadioButton: __webpack_require__(19),
	  Number: __webpack_require__(20),
	  Select: __webpack_require__(21),
	  Dial: __webpack_require__(22),
	  Piano: __webpack_require__(23),
	  Sequencer: __webpack_require__(24),
	  Pan2D: __webpack_require__(30),
	  Tilt: __webpack_require__(31),
	  Multislider: __webpack_require__(32),
	  Pan: __webpack_require__(33),
	  Envelope: __webpack_require__(34),
	  Spectrogram: __webpack_require__(35),
	  Meter: __webpack_require__(36),
	  Oscilloscope: __webpack_require__(37)
	};

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

	
	"use strict";
	
	var _interopRequireWildcard = function (obj) { return obj && obj.__esModule ? obj : { "default": obj }; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var Interface = __webpack_require__(6);
	var Step = __webpack_require__(11);
	
	var Interaction = _interopRequireWildcard(__webpack_require__(12));
	
	/**
	* Position
	*
	* @description Two-dimensional touch slider.
	*
	* @demo <span nexus-ui="position"></span>
	*
	* @example
	* var position = new Nexus.Position('#target')
	*
	* @example
	* var position = new Nexus.Position('#target',{
	*   'size': [200,200],
	*   'mode': 'absolute',  // "absolute" or "relative"
	*   'x': 0.5,  // initial x value
	*   'minX': 0,
	*   'maxX': 1,
	*   'stepX': 0,
	*   'y': 0.5,  // initial y value
	*   'minY': 0,
	*   'maxY': 1,
	*   'stepY': 0
	* })
	*
	* @output
	* change
	* Fires any time the interface's value changes. <br>
	* The event data is an object with x and y properties containing the x and y values of the interface.
	*
	* @outputexample
	* position.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*
	*/
	
	var Position = (function (_Interface) {
	  function Position() {
	    _classCallCheck(this, Position);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [200, 200],
	      mode: "absolute",
	      minX: 0,
	      maxX: 1,
	      stepX: 0,
	      x: 0.5,
	      minY: 0,
	      maxY: 1,
	      stepY: 0,
	      y: 0.5
	    };
	
	    _get(Object.getPrototypeOf(Position.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this._x = new Step(this.settings.minX, this.settings.maxX, this.settings.stepX, this.settings.x);
	    this._y = new Step(this.settings.minY, this.settings.maxY, this.settings.stepY, this.settings.y);
	
	    this.position = {
	      x: new Interaction.Handle(this.settings.mode, "horizontal", [0, this.width], [this.height, 0]),
	      y: new Interaction.Handle(this.settings.mode, "vertical", [0, this.width], [this.height, 0])
	    };
	    this.position.x.value = this._x.normalized;
	    this.position.y.value = this._y.normalized;
	
	    this.init();
	    this.render();
	  }
	
	  _inherits(Position, _Interface);
	
	  _createClass(Position, {
	    buildInterface: {
	      value: function buildInterface() {
	
	        this.knob = svg.create("circle");
	        this.element.appendChild(this.knob);
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        this.position.x.resize([0, this.width], [this.height, 0]);
	        this.position.y.resize([0, this.width], [this.height, 0]);
	
	        this._minDimension = Math.min(this.width, this.height);
	
	        this.knobRadius = {
	          off: ~ ~(this._minDimension / 100) * 5 + 5 };
	        this.knobRadius.on = this.knobRadius.off * 2;
	
	        this.knob.setAttribute("cx", this.width / 2);
	        this.knob.setAttribute("cy", this.height / 2);
	        this.knob.setAttribute("r", this.knobRadius.off);
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        this.element.style.backgroundColor = this.colors.fill;
	        this.knob.setAttribute("fill", this.colors.accent);
	      }
	    },
	    render: {
	      value: function render() {
	        if (this.clicked) {
	          //  this.knobRadius = 30;
	          this.knob.setAttribute("r", this.knobRadius.on);
	        } else {
	          //  this.knobRadius = 15;
	          this.knob.setAttribute("r", this.knobRadius.off);
	        }
	
	        this.knobCoordinates = {
	          x: this._x.normalized * this.width,
	          y: this.height - this._y.normalized * this.height
	        };
	
	        this.knob.setAttribute("cx", this.knobCoordinates.x);
	        this.knob.setAttribute("cy", this.knobCoordinates.y);
	      }
	    },
	    click: {
	      value: function click() {
	        this.position.x.anchor = this.mouse;
	        this.position.y.anchor = this.mouse;
	        this.move();
	      }
	    },
	    move: {
	      value: function move() {
	        if (this.clicked) {
	          this.position.x.update(this.mouse);
	          this.position.y.update(this.mouse);
	          this._x.updateNormal(this.position.x.value);
	          this._y.updateNormal(this.position.y.value);
	          this.emit("change", {
	            x: this._x.value,
	            y: this._y.value
	          });
	          this.render();
	        }
	      }
	    },
	    release: {
	      value: function release() {
	        this.render();
	      }
	    },
	    x: {
	
	      /**
	      * The interface's x value. When set, it will automatically adjust to fit min/max/step settings of the interface.
	      * @type {object}
	      * @example position.x = 0.5;
	      */
	
	      get: function () {
	        return this._x.value;
	      },
	      set: function (value) {
	        this._x.update(value);
	        this.emit("change", {
	          x: this._x.value,
	          y: this._y.value
	        });
	        this.render();
	      }
	    },
	    y: {
	
	      /**
	      * The interface's y values. When set, it will automatically adjust to fit min/max/step settings of the interface.
	      * @type {object}
	      * @example position.x = 0.5;
	      */
	
	      get: function () {
	        return this._y.value;
	      },
	      set: function (value) {
	        this._y.update(value);
	        this.emit("change", {
	          x: this._x.value,
	          y: this._y.value
	        });
	        this.render();
	      }
	    },
	    normalized: {
	      get: function () {
	        return {
	          x: this._x.normalized,
	          y: this._y.normalized
	        };
	      }
	    },
	    minX: {
	
	      /**
	      * The lower limit of value on the x axis
	      * @type {object}
	      */
	
	      get: function () {
	        return this._x.min;
	      },
	      set: function (v) {
	        this._x.min = v;
	        this.render();
	      }
	    },
	    minY: {
	
	      /**
	      * The lower limit of value on the y axis
	      * @type {object}
	      */
	
	      get: function () {
	        return this._y.min;
	      },
	      set: function (v) {
	        this._y.min = v;
	        this.render();
	      }
	    },
	    maxX: {
	
	      /**
	      * The upper limit of value on the x axis
	      * @type {object}
	      */
	
	      get: function () {
	        return this._x.max;
	      },
	      set: function (v) {
	        this._x.max = v;
	        this.render();
	      }
	    },
	    maxY: {
	
	      /**
	      * The upper limit of value on the y axis
	      * @type {object}
	      */
	
	      get: function () {
	        return this._y.max;
	      },
	      set: function (v) {
	        this._y.max = v;
	        this.render();
	      }
	    },
	    stepX: {
	
	      /**
	      * The incremental step of values on the x axis
	      * @type {object}
	      */
	
	      get: function () {
	        return this._x.step;
	      },
	      set: function (v) {
	        this._x.step = v;
	        this.render();
	      }
	    },
	    stepY: {
	
	      /**
	      * The incremental step of values on the y axis
	      * @type {object}
	      */
	
	      get: function () {
	        return this._y.step;
	      },
	      set: function (v) {
	        this._y.step = v;
	        this.render();
	      }
	    },
	    mode: {
	
	      /**
	      Absolute mode (position's value jumps to mouse click position) or relative mode (mouse drag changes value relative to its current position). Default: "absolute".
	      @type {string}
	      @example position.mode = "relative";
	      */
	
	      get: function () {
	        return this.position.x.mode;
	      },
	      set: function (v) {
	        this.position.x.mode = v;
	        this.position.y.mode = v;
	      }
	    }
	  });
	
	  return Position;
	})(Interface);
	
	module.exports = Position;

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var math = __webpack_require__(5);
	
	module.exports = {
	
	  create: function (type) {
	    return document.createElementNS("http://www.w3.org/2000/svg", type);
	  },
	
	  arc: function (x, y, radius, startAngle, endAngle) {
	
	    var start = math.toCartesian(radius, endAngle);
	    var end = math.toCartesian(radius, startAngle);
	
	    var largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
	
	    var d = ["M", start.x + x, start.y + y, "A", radius, radius, 0, largeArcFlag, 0, end.x + x, end.y + y].join(" ");
	
	    return d;
	  },
	
	  radialGradient: function (defs, numberOfStops) {
	
	    var id = "gradient" + math.ri(100000000000);
	    var stops = [];
	
	    var gradient = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
	    gradient.setAttribute("id", id);
	    gradient.setAttribute("cx", "50%");
	    gradient.setAttribute("cy", "50%");
	    gradient.setAttribute("r", "50%");
	
	    defs.appendChild(gradient);
	
	    for (var i = 0; i < numberOfStops; i++) {
	      var _stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
	      _stop.setAttribute("id", "stop" + i);
	      //stop.setAttribute('offset', '70%');
	      //stop.setAttribute('stop-color', 'White');
	      gradient.appendChild(_stop);
	      stops.push(_stop);
	    }
	
	    return {
	      id: id,
	      stops: stops,
	      element: gradient
	    };
	  }
	
	};

/***/ }),
/* 5 */
/***/ (function(module, exports) {

	"use strict";
	
	/**
	 * Limit a number to within a minimum and maximum
	 * @param  {number} value Input value
	 * @param  {number} min   Lower limit
	 * @param  {number} max   Upper limit
	 * @return {number}       The input value constrained within the lower and upper limits
	 * @example
	 * Nexus.clip(11,0,10)   // returns 10
	 * Nexus.clip(-1,0,10)   // returns 0
	 * Nexus.clip(5,0,10)    // returns 5
	 */
	
	exports.clip = function (value, min, max) {
	  return Math.min(Math.max(value, min), max);
	};
	
	exports.normalize = function (value, min, max) {
	  return (value - min) / (max - min);
	};
	
	/**
	 * Scale a value from one range to another range.
	 * @param  {number} inNum  Input value
	 * @param  {number} inMin  Input range minimum
	 * @param  {number} inMax  Input range maximum
	 * @param  {number} outMin Output range minimum
	 * @param  {number} outMax Output range maximum
	 * @return {number}        The input value scaled to its new range
	 * @example
	 * Nexus.scale(0.5,0,1,0,10)   // returns 5
	 * Nexus.scale(0.9,0,1,1,0)    // returns 0.1
	 */
	exports.scale = function (inNum, inMin, inMax, outMin, outMax) {
	  if (inMin === inMax) {
	    return outMin;
	  }
	  return (inNum - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
	};
	
	exports.toPolar = function (x, y) {
	  var r = Math.sqrt(x * x + y * y);
	
	  var theta = Math.atan2(y, x);
	  if (theta < 0) {
	    theta = theta + 2 * Math.PI;
	  }
	  return { radius: r, angle: theta };
	};
	
	exports.toCartesian = function (radius, angle) {
	  var cos = Math.cos(angle);
	  var sin = Math.sin(angle);
	  return { x: radius * cos, y: radius * sin * -1 };
	};
	/*
	exports.polarToCartesian(centerX, centerY, radius, angleInDegrees) {
	  var angleInRadians = (angleInDegrees-90) * Math.PI / 180.0;
	
	  return {
	    x: centerX + (radius * Math.cos(angleInRadians)),
	    y: centerY + (radius * Math.sin(angleInRadians))
	  };
	}  */
	
	exports.prune = function (data, scale) {
	  return parseFloat(data.toFixed(scale));
	};
	
	exports.invert = function (inNum) {
	  return exports.scale(inNum, 1, 0, 0, 1);
	};
	
	/**
	 * Convert a MIDi note number to a frequency value in equal temperament.
	 * @param  {number} midi MIDI note value
	 * @return {number}      Frequence value
	 * @example
	 * Nexus.mtof(60)  // returns the frequency number of Middle C
	 */
	exports.mtof = function (midi) {
	  return Math.pow(2, (midi - 69) / 12) * 440;
	};
	
	/**
	 * Interpolate between two numbers
	 * @param  {number} loc Interpolation index (0-1)
	 * @param  {number} min Lower value
	 * @param  {number} max Upper value
	 * @return {number}     Interpolated value
	 * @example
	 * Nexus.interp(0.5,2,4)   // returns 3
	 * Nexus.interp(0.1,0,10)     // returns 1
	 */
	exports.interp = function (loc, min, max) {
	  return loc * (max - min) + min;
	};
	
	/**
	 * Return a random choice from a list of arguments
	 * @return {various} One random argument
	 * @example
	 * Nexus.pick(1,2,3,4)   // returns 1, 2, 3, or 4
	 * Nexus.pick(function1,function2)   // returns either function1 or function2
	 */
	exports.pick = function () {
	  return arguments[~ ~(Math.random() * arguments.length)];
	};
	
	/**
	 * Returns an octave multiplier for frequency values
	 * @param  {number} num Relative octave number (e.g. -1 for one octave down, 1 for one octave up)
	 * @return {number}     Octave multiplier
	 * @example
	 * Nexus.octave(-1)  // returns 0.5
	 * Nexus.octave(0)   // returns 1
	 * Nexus.octave(1)   // returns 2
	 * Nexus.octave(2)   // returns 4
	 */
	exports.octave = function (num) {
	  return Math.pow(2, num);
	};
	
	/**
	 * Random integer generator. If no second argument is given, will return random integer from 0 to bound1.
	 * @param  {number} bound1 Minimum random value
	 * @param  {number} bound2 Maximum random value
	 * @return {number}        Random integer between lower and upper boundary
	 * @example
	 * Nexus.ri(10)    // returns random int from 0 to 10
	 * Nexus.ri(20,2000) // returns random int from 20 to 2000
	 */
	exports.ri = function (bound1, bound2) {
	  if (!bound2) {
	    bound2 = bound1;
	    bound1 = 0;
	  }
	  var low = Math.min(bound1, bound2);
	  var high = Math.max(bound1, bound2);
	  return Math.floor(Math.random() * (high - low) + low);
	};
	
	/**
	 * Random float number generator. If no second argument is given, will return random float from 0 to bound1.
	 * @param  {number} bound1 Minimum random value
	 * @param  {number} bound2 Maximum random value
	 * @return {number}        Random float between lower and upper boundary
	 * @example
	 * Nexus.rf(1)    // returns random float from 0 to 1
	 * Nexus.rf(1,2) // returns random float from 1 to 2
	 */
	exports.rf = function (bound1, bound2) {
	  if (!bound2) {
	    bound2 = bound1;
	    bound1 = 0;
	  }
	  var low = Math.min(bound1, bound2);
	  var high = Math.max(bound1, bound2);
	  return Math.random() * (high - low) + low;
	};
	
	exports.cycle = function (input, min, max) {
	  input++;
	  if (input >= max) {
	    input = min;
	  }
	  return input;
	};
	
	/**
	 * Average an array of numbers
	 * @param  {Array} data Array of numbers to average
	 * @return {number}      Average of the input data
	 * @example
	 * Nexus.average([0,2,4,6,8,10])   // returns 5
	 */
	exports.average = function (data) {
	  var total = 0;
	  for (var i = 0; i < data.length; i++) {
	    total += data[i];
	  }
	  return total / data.length;
	};
	
	/**
	 * Get the distance from one (x,y) point to another (x,y) point
	 * @param  {number} x1 x of first point
	 * @param  {number} y1 y of first point
	 * @param  {number} x2 x of second point
	 * @param  {number} y2 y of second poiny
	 * @return {number}    Distance
	 * @example
	 * Nexus.distance(0,0,3,4)   // returns 5
	 */
	exports.distance = function (x1, y1, x2, y2) {
	  var a = x1 - x2;
	  var b = y1 - y2;
	  return Math.sqrt(a * a + b * b);
	};
	
	exports.gainToDB = function (gain) {
	  return 20 * Math.log10(gain);
	};
	
	/**
	 * Flip a coin, returning either 0 or 1 according to a probability
	 * @param  {number} [odds=0.5] Likelihood of returning 1
	 * @return {number}            1 or 0
	 * @example
	 * Nexus.coin(0.1)   // returns 1 (10% of the time) or 0 (90% of the time)
	 */
	exports.coin = function () {
	  var odds = arguments[0] === undefined ? 0.5 : arguments[0];
	
	  if (exports.rf(0, 1) < odds) {
	    return 1;
	  } else {
	    return 0;
	  }
	};

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var dom = __webpack_require__(7);
	var util = __webpack_require__(8);
	var touch = __webpack_require__(9);
	var EventEmitter = __webpack_require__(10);
	
	var colors = __webpack_require__(1).colors;
	
	/**
	Interface
	*/
	
	var Interface = (function (_EventEmitter) {
	  function Interface(args, options, defaults) {
	    _classCallCheck(this, Interface);
	
	    _get(Object.getPrototypeOf(Interface.prototype), "constructor", this).call(this);
	    this.type = this.constructor.name;
	    this.settings = this.parseSettings(args, options, defaults);
	    this.mouse = {};
	    this.wait = false;
	    this.colors = {};
	    var defaultColors = colors(); // jshint ignore:line
	    this.colors.accent = defaultColors.accent;
	    this.colors.fill = defaultColors.fill;
	    this.colors.light = defaultColors.light;
	    this.colors.dark = defaultColors.dark;
	    this.colors.mediumLight = defaultColors.mediumLight;
	    this.colors.mediumDark = defaultColors.mediumDark;
	  }
	
	  _inherits(Interface, _EventEmitter);
	
	  _createClass(Interface, {
	    parseSettings: {
	      value: function parseSettings(args, options, defaults) {
	
	        options.unshift("target");
	        defaults.defaultSize = defaults.size.splice(0, 2);
	        defaults.size = false;
	
	        var settings = {
	          target: document.body,
	          colors: {}, // should inherit from a colors module,
	          snapWithParent: true,
	          event: function event() {},
	          component: false
	        };
	
	        for (var key in defaults) {
	          settings[key] = defaults[key];
	        }
	
	        for (var i = 0; i < args.length; i++) {
	          // grabs the next argument
	          var setting = args[i];
	          // if it's an object, it must be the settings object
	          if (util.isObject(setting)) {
	            for (var key in setting) {
	              settings[key] = setting[key];
	            }
	            // if it's a function, it must be the event setting
	          } else if (typeof setting === "function") {
	            settings.event = setting;
	            // otherwise, consider it one of the widget's custom options
	          } else if (options.length >= 1) {
	            // grab the first option -- i.e. 'target'
	            var key = options.splice(0, 1)[0];
	            settings[key] = setting;
	          }
	        }
	
	        /*  handle common settings  */
	
	        // target
	        this.parent = dom.parseElement(settings.target);
	
	        // nexus-ui attribute
	        if (this.parent && this.parent instanceof HTMLElement && !settings.component) {
	          if (!this.parent.hasAttribute("nexus-ui")) {
	            this.parent.setAttribute("nexus-ui", "");
	          }
	        }
	
	        // size
	
	        if (settings.size && Array.isArray(settings.size) && settings.snapWithParent) {
	          this.width = settings.size[0];
	          this.height = settings.size[1];
	          this.parent.style.width = this.width + "px";
	          this.parent.style.height = this.height + "px";
	        } else if (settings.snapWithParent && !settings.component) {
	
	          this.width = parseFloat(window.getComputedStyle(this.parent, null).getPropertyValue("width").replace("px", ""));
	          this.height = parseFloat(window.getComputedStyle(this.parent, null).getPropertyValue("height").replace("px", ""));
	
	          if (this.width == 5000) {
	            this.width = settings.defaultSize[0];
	            this.parent.style.width = this.parent.width = this.width + "px";
	          }
	          if (this.height == 5000) {
	            this.height = settings.defaultSize[1];
	            this.parent.style.height = this.parent.height = this.height + "px";
	          }
	        } else {
	          settings.size = settings.defaultSize;
	          this.width = settings.size[0];
	          this.height = settings.size[1];
	        }
	
	        // event
	        if (settings.event) {
	          this.event = this.on("change", settings.event);
	        } else {
	          this.event = false;
	        }
	
	        return settings;
	      }
	    },
	    init: {
	      value: function init() {
	        this.buildFrame();
	        this.buildInterface();
	        this.sizeInterface();
	        this.attachListeners();
	        this.colorInterface();
	        this.finalTouches();
	      }
	    },
	    buildFrame: {
	      value: function buildFrame() {
	        this.element = svg.create("svg");
	        this.element.setAttribute("width", this.width);
	        this.element.setAttribute("height", this.height);
	        this.parent.appendChild(this.element);
	      }
	    },
	    buildInterface: {
	      value: function buildInterface() {}
	    },
	    sizeInterface: {
	      value: function sizeInterface() {}
	    },
	    colorInterface: {
	      value: function colorInterface() {}
	    },
	    attachListeners: {
	      value: function attachListeners() {
	        var _this = this;
	
	        this.interactionTarget = this.interactionTarget || this.element;
	
	        // Setup interaction
	        if (touch.exists) {
	          this.interactionTarget.addEventListener("touchstart", function (evt) {
	            return _this.preTouch(evt);
	          });
	          this.interactionTarget.addEventListener("touchmove", function (evt) {
	            return _this.preTouchMove(evt);
	          });
	          this.interactionTarget.addEventListener("touchend", function (evt) {
	            return _this.preTouchRelease(evt);
	          });
	        }
	        this.boundPreMove = function (evt) {
	          return _this.preMove(evt);
	        };
	        this.boundPreRelease = function (evt) {
	          return _this.preRelease(evt);
	        };
	        this.interactionTarget.addEventListener("mousedown", function (evt) {
	          return _this.preClick(evt);
	        });
	      }
	    },
	    finalTouches: {
	      value: function finalTouches() {
	        this.element.style.cursor = "pointer";
	      }
	    },
	    preClick: {
	      value: function preClick(e) {
	        // 10000 getComputedStyle calls takes 100 ms.
	        // .:. one takes about .01ms
	        if (this.element instanceof HTMLElement) {
	          this.width = window.getComputedStyle(this.element, null).getPropertyValue("width").replace("px", "");
	        }
	        // 10000 getComputedStyle calls takes 40 ms.
	        // .:. one takes about .004ms
	        this.offset = dom.findPosition(this.element);
	        this.mouse = dom.locateMouse(e, this.offset);
	        this.clicked = true;
	        this.click();
	        this.moveEvent = document.addEventListener("mousemove", this.boundPreMove);
	        this.releaseEvent = document.addEventListener("mouseup", this.boundPreRelease);
	        this.emit("click");
	        e.preventDefault();
	        e.stopPropagation();
	      }
	    },
	    preMove: {
	      value: function preMove(e) {
	        var _this = this;
	
	        if (!this.wait) {
	          this.mouse = dom.locateMouse(e, this.offset);
	          this.move();
	          this.wait = true;
	          setTimeout(function () {
	            _this.wait = false;
	          }, 25);
	        }
	        e.preventDefault();
	        e.stopPropagation();
	      }
	    },
	    preRelease: {
	      value: function preRelease(e) {
	        this.mouse = dom.locateMouse(e, this.offset);
	        this.clicked = false;
	        this.release();
	        this.emit("release");
	        document.removeEventListener("mousemove", this.boundPreMove);
	        document.removeEventListener("mouseup", this.boundPreRelease);
	        e.preventDefault();
	        e.stopPropagation();
	      }
	    },
	    click: {
	      value: function click() {}
	    },
	    move: {
	      value: function move() {}
	    },
	    release: {
	      value: function release() {}
	    },
	    preTouch: {
	
	      /* touch */
	
	      value: function preTouch(e) {
	        if (this.element instanceof HTMLElement) {
	          this.width = window.getComputedStyle(this.element, null).getPropertyValue("width").replace("px", "");
	        }
	        this.offset = dom.findPosition(this.element);
	        this.mouse = dom.locateTouch(e, this.offset);
	        this.clicked = true;
	        this.touch(e);
	        this.emit("click");
	        e.preventDefault();
	        e.stopPropagation();
	      }
	    },
	    preTouchMove: {
	      value: function preTouchMove(e) {
	        if (this.clicked) {
	          this.mouse = dom.locateTouch(e, this.offset);
	          this.touchMove();
	          e.preventDefault();
	          e.stopPropagation();
	        }
	      }
	    },
	    preTouchRelease: {
	      value: function preTouchRelease(e) {
	        this.mouse = dom.locateTouch(e, this.offset);
	        this.clicked = false;
	        this.touchRelease();
	        this.emit("release");
	        e.preventDefault();
	        e.stopPropagation();
	      }
	    },
	    touch: {
	      value: function touch() {
	        this.click();
	      }
	    },
	    touchMove: {
	      value: function touchMove() {
	        this.move();
	      }
	    },
	    touchRelease: {
	      value: function touchRelease() {
	        this.release();
	      }
	    },
	    resize: {
	
	      /**
	      * Resize the interface
	      * @param width {number} New width in pixels
	      * @param height {number} New height in pixels
	      *
	      * @example
	      * button.resize(100,100);
	      */
	
	      value: function resize(width, height) {
	        this.width = width;
	        this.height = height;
	        this.parent.style.width = this.width + "px";
	        this.parent.style.height = this.height + "px";
	        this.element.setAttribute("width", this.width);
	        this.element.setAttribute("height", this.height);
	        this.sizeInterface();
	      }
	    },
	    empty: {
	      value: function empty() {
	        while (this.element.lastChild) {
	          this.element.removeChild(this.element.lastChild);
	        }
	      }
	    },
	    destroy: {
	
	      /**
	      * Remove the interface from the page and cancel its event listener(s).
	      *
	      * @example
	      * button.destroy();
	      */
	
	      value: function destroy() {
	        this.empty();
	        this.parent.removeChild(this.element);
	        this.removeAllListeners();
	        if (this.instrument) {
	          delete this.instrument[this.id];
	        }
	        this.customDestroy();
	      }
	    },
	    customDestroy: {
	      value: function customDestroy() {}
	    },
	    colorize: {
	      value: function colorize(type, color) {
	        this.colors[type] = color;
	        this.colorInterface();
	      }
	    }
	  });
	
	  return Interface;
	})(EventEmitter);
	
	module.exports = Interface;

/***/ }),
/* 7 */
/***/ (function(module, exports) {

	"use strict";
	
	exports.findPosition = function (el) {
	  var viewportOffset = el.getBoundingClientRect();
	  var top = viewportOffset.top + window.scrollY;
	  var left = viewportOffset.left + window.scrollX;
	  return { top: top, left: left };
	};
	
	exports.parseElement = function (parent) {
	  if (typeof parent === "string") {
	    parent = document.getElementById(parent.replace("#", ""));
	  }
	
	  if (parent instanceof HTMLElement || parent instanceof SVGElement) {
	    return parent;
	  } else {
	    return "No valid parent argument";
	  }
	};
	
	exports.locateMouse = function (e, offset) {
	  return {
	    x: e.pageX - offset.left,
	    y: e.pageY - offset.top
	  };
	};
	
	exports.locateTouch = function (e, offset) {
	  return {
	    x: e.targetTouches.length ? e.targetTouches[0].pageX - offset.left : false,
	    y: e.targetTouches.length ? e.targetTouches[0].pageY - offset.top : false
	  };
	};
	
	exports.SmartCanvas = function (parent) {
	  var _this = this;
	
	  this.element = document.createElement("canvas");
	  this.context = this.element.getContext("2d");
	  parent.appendChild(this.element);
	
	  this.resize = function (w, h) {
	    _this.element.width = w * 2;
	    _this.element.height = h * 2;
	    _this.element.style.width = w + "px";
	    _this.element.style.height = h + "px";
	  };
	};

/***/ }),
/* 8 */
/***/ (function(module, exports) {

	"use strict";
	
	exports.isObject = function (obj) {
	  if (typeof obj === "object" && !Array.isArray(obj) && obj !== null && obj instanceof SVGElement === false && obj instanceof HTMLElement === false) {
	    return true;
	  } else {
	    return false;
	  }
	};
	
	// Restricts input for the given textbox to the given inputFilter function
	// cf https://stackoverflow.com/a/469362
	exports.setInputFilter = function (textbox, inputFilter) {
	  ["input", "keydown", "keyup", "mousedown", "mouseup", "select", "contextmenu", "drop"].forEach(function (event) {
	    textbox.addEventListener(event, function () {
	      if (inputFilter(this.value)) {
	        this.oldValue = this.value;
	        this.oldSelectionStart = this.selectionStart;
	        this.oldSelectionEnd = this.selectionEnd;
	      } else if (this.hasOwnProperty("oldValue")) {
	        this.value = this.oldValue;
	        this.setSelectionRange(this.oldSelectionStart, this.oldSelectionEnd);
	      } else {
	        this.value = "";
	      }
	    });
	  });
	};

/***/ }),
/* 9 */
/***/ (function(module, exports) {

	"use strict";
	
	exports.exists = "ontouchstart" in document.documentElement;

/***/ }),
/* 10 */
/***/ (function(module, exports) {

	// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.
	
	function EventEmitter() {
	  this._events = this._events || {};
	  this._maxListeners = this._maxListeners || undefined;
	}
	module.exports = EventEmitter;
	
	// Backwards-compat with node 0.10.x
	EventEmitter.EventEmitter = EventEmitter;
	
	EventEmitter.prototype._events = undefined;
	EventEmitter.prototype._maxListeners = undefined;
	
	// By default EventEmitters will print a warning if more than 10 listeners are
	// added to it. This is a useful default which helps finding memory leaks.
	EventEmitter.defaultMaxListeners = 10;
	
	// Obviously not all Emitters should be limited to 10. This function allows
	// that to be increased. Set to zero for unlimited.
	EventEmitter.prototype.setMaxListeners = function(n) {
	  if (!isNumber(n) || n < 0 || isNaN(n))
	    throw TypeError('n must be a positive number');
	  this._maxListeners = n;
	  return this;
	};
	
	EventEmitter.prototype.emit = function(type) {
	  var er, handler, len, args, i, listeners;
	
	  if (!this._events)
	    this._events = {};
	
	  // If there is no 'error' event listener then throw.
	  if (type === 'error') {
	    if (!this._events.error ||
	        (isObject(this._events.error) && !this._events.error.length)) {
	      er = arguments[1];
	      if (er instanceof Error) {
	        throw er; // Unhandled 'error' event
	      } else {
	        // At least give some kind of context to the user
	        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
	        err.context = er;
	        throw err;
	      }
	    }
	  }
	
	  handler = this._events[type];
	
	  if (isUndefined(handler))
	    return false;
	
	  if (isFunction(handler)) {
	    switch (arguments.length) {
	      // fast cases
	      case 1:
	        handler.call(this);
	        break;
	      case 2:
	        handler.call(this, arguments[1]);
	        break;
	      case 3:
	        handler.call(this, arguments[1], arguments[2]);
	        break;
	      // slower
	      default:
	        args = Array.prototype.slice.call(arguments, 1);
	        handler.apply(this, args);
	    }
	  } else if (isObject(handler)) {
	    args = Array.prototype.slice.call(arguments, 1);
	    listeners = handler.slice();
	    len = listeners.length;
	    for (i = 0; i < len; i++)
	      listeners[i].apply(this, args);
	  }
	
	  return true;
	};
	
	EventEmitter.prototype.addListener = function(type, listener) {
	  var m;
	
	  if (!isFunction(listener))
	    throw TypeError('listener must be a function');
	
	  if (!this._events)
	    this._events = {};
	
	  // To avoid recursion in the case that type === "newListener"! Before
	  // adding it to the listeners, first emit "newListener".
	  if (this._events.newListener)
	    this.emit('newListener', type,
	              isFunction(listener.listener) ?
	              listener.listener : listener);
	
	  if (!this._events[type])
	    // Optimize the case of one listener. Don't need the extra array object.
	    this._events[type] = listener;
	  else if (isObject(this._events[type]))
	    // If we've already got an array, just append.
	    this._events[type].push(listener);
	  else
	    // Adding the second element, need to change to array.
	    this._events[type] = [this._events[type], listener];
	
	  // Check for listener leak
	  if (isObject(this._events[type]) && !this._events[type].warned) {
	    if (!isUndefined(this._maxListeners)) {
	      m = this._maxListeners;
	    } else {
	      m = EventEmitter.defaultMaxListeners;
	    }
	
	    if (m && m > 0 && this._events[type].length > m) {
	      this._events[type].warned = true;
	      console.error('(node) warning: possible EventEmitter memory ' +
	                    'leak detected. %d listeners added. ' +
	                    'Use emitter.setMaxListeners() to increase limit.',
	                    this._events[type].length);
	      if (typeof console.trace === 'function') {
	        // not supported in IE 10
	        console.trace();
	      }
	    }
	  }
	
	  return this;
	};
	
	EventEmitter.prototype.on = EventEmitter.prototype.addListener;
	
	EventEmitter.prototype.once = function(type, listener) {
	  if (!isFunction(listener))
	    throw TypeError('listener must be a function');
	
	  var fired = false;
	
	  function g() {
	    this.removeListener(type, g);
	
	    if (!fired) {
	      fired = true;
	      listener.apply(this, arguments);
	    }
	  }
	
	  g.listener = listener;
	  this.on(type, g);
	
	  return this;
	};
	
	// emits a 'removeListener' event iff the listener was removed
	EventEmitter.prototype.removeListener = function(type, listener) {
	  var list, position, length, i;
	
	  if (!isFunction(listener))
	    throw TypeError('listener must be a function');
	
	  if (!this._events || !this._events[type])
	    return this;
	
	  list = this._events[type];
	  length = list.length;
	  position = -1;
	
	  if (list === listener ||
	      (isFunction(list.listener) && list.listener === listener)) {
	    delete this._events[type];
	    if (this._events.removeListener)
	      this.emit('removeListener', type, listener);
	
	  } else if (isObject(list)) {
	    for (i = length; i-- > 0;) {
	      if (list[i] === listener ||
	          (list[i].listener && list[i].listener === listener)) {
	        position = i;
	        break;
	      }
	    }
	
	    if (position < 0)
	      return this;
	
	    if (list.length === 1) {
	      list.length = 0;
	      delete this._events[type];
	    } else {
	      list.splice(position, 1);
	    }
	
	    if (this._events.removeListener)
	      this.emit('removeListener', type, listener);
	  }
	
	  return this;
	};
	
	EventEmitter.prototype.removeAllListeners = function(type) {
	  var key, listeners;
	
	  if (!this._events)
	    return this;
	
	  // not listening for removeListener, no need to emit
	  if (!this._events.removeListener) {
	    if (arguments.length === 0)
	      this._events = {};
	    else if (this._events[type])
	      delete this._events[type];
	    return this;
	  }
	
	  // emit removeListener for all listeners on all events
	  if (arguments.length === 0) {
	    for (key in this._events) {
	      if (key === 'removeListener') continue;
	      this.removeAllListeners(key);
	    }
	    this.removeAllListeners('removeListener');
	    this._events = {};
	    return this;
	  }
	
	  listeners = this._events[type];
	
	  if (isFunction(listeners)) {
	    this.removeListener(type, listeners);
	  } else if (listeners) {
	    // LIFO order
	    while (listeners.length)
	      this.removeListener(type, listeners[listeners.length - 1]);
	  }
	  delete this._events[type];
	
	  return this;
	};
	
	EventEmitter.prototype.listeners = function(type) {
	  var ret;
	  if (!this._events || !this._events[type])
	    ret = [];
	  else if (isFunction(this._events[type]))
	    ret = [this._events[type]];
	  else
	    ret = this._events[type].slice();
	  return ret;
	};
	
	EventEmitter.prototype.listenerCount = function(type) {
	  if (this._events) {
	    var evlistener = this._events[type];
	
	    if (isFunction(evlistener))
	      return 1;
	    else if (evlistener)
	      return evlistener.length;
	  }
	  return 0;
	};
	
	EventEmitter.listenerCount = function(emitter, type) {
	  return emitter.listenerCount(type);
	};
	
	function isFunction(arg) {
	  return typeof arg === 'function';
	}
	
	function isNumber(arg) {
	  return typeof arg === 'number';
	}
	
	function isObject(arg) {
	  return typeof arg === 'object' && arg !== null;
	}
	
	function isUndefined(arg) {
	  return arg === void 0;
	}


/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var math = __webpack_require__(5);
	
	/**
	  Creates a steppable value with minimum, maximum, and step size. This is used in many interfaces to constrict their values to certain ranges.
	  @param {number} [min=0] minimum
	  @param {number} [max=1] maximum
	  @param {number} [step=0]
	  @param {number} [value=0] initial value
	  @returns {Object} Step
	*/
	
	var Step = (function () {
	  function Step() {
	    var min = arguments[0] === undefined ? 0 : arguments[0];
	    var max = arguments[1] === undefined ? 1 : arguments[1];
	    var step = arguments[2] === undefined ? 0 : arguments[2];
	    var value = arguments[3] === undefined ? 0 : arguments[3];
	
	    _classCallCheck(this, Step);
	
	    //Object.assign(this,{min,max,step});
	    //Cannot use Object.assign because not supported in Safari.
	    //I would expect for Babel to take care of this but it is not.
	    this.min = min;
	    this.max = max;
	    this.step = step;
	    this.value = value;
	    this.changed = false;
	    this.oldValue = false;
	    this.update(this.value);
	  }
	
	  _createClass(Step, {
	    update: {
	
	      /**
	        Update with a new value. The value will be auto-adjusted to fit the min/max/step.
	        @param {number} value
	      */
	
	      value: function update(value) {
	        if (this.step) {
	          // this.value = math.clip(Math.round(value / (this.step)) * this.step, this.min,this.max);
	          this.value = math.clip(Math.round((value - this.min) / this.step) * this.step + this.min, this.min, this.max);
	        } else {
	          this.value = math.clip(value, this.min, this.max);
	        }
	        if (this.oldValue !== this.value) {
	          this.oldValue = this.value;
	          this.changed = true;
	        } else {
	          this.changed = false;
	        }
	        return this.value;
	      }
	    },
	    updateNormal: {
	
	      /**
	        Update with a normalized value 0-1.
	        @param {number} value
	      */
	
	      value: function updateNormal(value) {
	        this.value = math.scale(value, 0, 1, this.min, this.max);
	        return this.update(this.value);
	      }
	    },
	    normalized: {
	
	      /**
	        Get a normalized version of this.value . Not settable.
	      */
	
	      get: function () {
	        return math.normalize(this.value, this.min, this.max);
	      }
	    }
	  });
	
	  return Step;
	})();
	
	module.exports = Step;

/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	"use strict";
	
	var math = _interopRequire(__webpack_require__(5));
	
	var ToggleModel = _interopRequire(__webpack_require__(13));
	
	/*
	how to use :
	
	dial.interaction = new Handle('radial','relative',this.width,this.height);
	// dial.interaction.mode = 'relative'
	// dial.interaction.direction = 'radial'
	
	on click:
	dial.interaction.anchor = this.mouse;
	
	on move:
	dial.interaction.update(this.mouse);
	
	console.log( dial.interaction.value ); should be a normalized value.
	
	*/
	
	/*
	  absolute/relative are property: mode
	  radial/vertical/horizontal/2d are property: direction
	
	  plan :
	
	  if relative --
	  NO on click, get value offset between current value and click value.
	  NO on move, use click value - offset
	  INSTEAD
	  use delta -- bc vertical motion on dial is impossible otherwise
	  also allow to set sensitivity
	
	*/
	
	var Handle = exports.Handle = (function () {
	  function Handle() {
	    var mode = arguments[0] === undefined ? "absolute" : arguments[0];
	    var direction = arguments[1] === undefined ? "vertical" : arguments[1];
	    var xbound = arguments[2] === undefined ? [0, 100] : arguments[2];
	    var ybound = arguments[3] === undefined ? [0, 100] : arguments[3];
	
	    _classCallCheck(this, Handle);
	
	    this.mode = mode;
	    this.direction = direction;
	    this.previous = 0;
	    this.value = 0;
	    this.sensitivity = 1;
	    this.resize(xbound, ybound);
	  }
	
	  _createClass(Handle, {
	    resize: {
	      value: function resize(xbound, ybound) {
	        this.boundary = {
	          min: {
	            x: xbound[0],
	            y: ybound[0]
	          },
	          max: {
	            x: xbound[1],
	            y: ybound[1]
	          },
	          center: {
	            x: (xbound[1] - xbound[0]) / 2 + xbound[0],
	            y: (ybound[1] - ybound[0]) / 2 + ybound[0]
	          }
	        };
	      }
	    },
	    anchor: {
	      set: function (mouse) {
	        this._anchor = this.convertPositionToValue(mouse);
	      },
	      get: function () {
	        return this._anchor;
	      }
	    },
	    update: {
	      value: function update(mouse) {
	        if (this.mode === "relative") {
	          var increment = this.convertPositionToValue(mouse) - this.anchor;
	          if (Math.abs(increment) > 0.5) {
	            increment = 0;
	          }
	          this.anchor = mouse;
	          this.value = this.value + increment * this.sensitivity;
	        } else {
	          this.value = this.convertPositionToValue(mouse);
	        }
	        this.value = math.clip(this.value, 0, 1);
	      }
	    },
	    convertPositionToValue: {
	      value: function convertPositionToValue(current) {
	        switch (this.direction) {
	          case "radial":
	            var position = math.toPolar(current.x - this.boundary.center.x, current.y - this.boundary.center.y);
	            position = position.angle / (Math.PI * 2);
	            position = (position - 0.25 + 1) % 1;
	            return position;
	          case "vertical":
	            return math.scale(current.y, this.boundary.min.y, this.boundary.max.y, 0, 1);
	          case "horizontal":
	            return math.scale(current.x, this.boundary.min.x, this.boundary.max.x, 0, 1);
	        }
	      }
	    }
	  });
	
	  return Handle;
	})();
	
	var Button = exports.Button = (function () {
	  function Button() {
	    var mode = arguments[0] === undefined ? "button" : arguments[0];
	
	    _classCallCheck(this, Button);
	
	    this.mode = mode;
	    this.state = new ToggleModel();
	    this.paintbrush = false;
	  }
	
	  _createClass(Button, {
	    click: {
	      value: function click() {
	        switch (this.mode) {
	          case "impulse":
	            this.state.on();
	            if (this.timeout) {
	              clearTimeout(this.timeout);
	            }
	            this.timeout = setTimeout(this.state.off.bind(this), 30);
	            this.emit("change", this.state);
	            break;
	          case "button":
	            this.turnOn();
	            this.emit("change", this.state);
	            break;
	          case "aftertouch":
	            this.position = {
	              x: math.clip(this.mouse.x / this.width, 0, 1),
	              y: math.clip(1 - this.mouse.y / this.height, 0, 1)
	            };
	            this.turnOn();
	            this.emit("change", {
	              state: this.state,
	              x: this.position.x,
	              y: this.position.y });
	            break;
	          case "toggle":
	            this.flip();
	            this.emit("change", this.state);
	            break;
	        }
	      }
	    },
	    move: {
	      value: function move() {
	        if (this.mode === "aftertouch") {
	          this.position = {
	            x: math.clip(this.mouse.x / this.width, 0, 1),
	            y: math.clip(1 - this.mouse.y / this.height, 0, 1)
	          };
	          this.emit("change", {
	            state: this.state,
	            x: this.position.x,
	            y: this.position.y });
	          this.render();
	        }
	      }
	    },
	    release: {
	      value: function release() {
	        switch (this.mode) {
	          case "button":
	            this.turnOff();
	            this.emit("change", this.state);
	            break;
	          case "aftertouch":
	            this.turnOff();
	            this.position = {
	              x: this.mouse.x / this.width,
	              y: 1 - this.mouse.y / this.height
	            };
	            this.emit("change", {
	              state: this.state,
	              x: this.position.x,
	              y: this.position.y });
	            break;
	        }
	      }
	    }
	  });
	
	  return Button;
	})();

/***/ }),
/* 13 */
/***/ (function(module, exports) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var Toggle = (function () {
	  function Toggle(state) {
	    _classCallCheck(this, Toggle);
	
	    this.state = state || false;
	  }
	
	  _createClass(Toggle, {
	    flip: {
	      value: function flip(state) {
	        if (state || state === false) {
	          this.state = state;
	        } else {
	          this.state = !this.state;
	        }
	      }
	    },
	    on: {
	      value: function on() {
	        this.state = true;
	      }
	    },
	    off: {
	      value: function off() {
	        this.state = false;
	      }
	    }
	  });
	
	  return Toggle;
	})();
	
	module.exports = Toggle;

/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequireWildcard = function (obj) { return obj && obj.__esModule ? obj : { "default": obj }; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var Interface = __webpack_require__(6);
	var Step = __webpack_require__(11);
	
	var Interaction = _interopRequireWildcard(__webpack_require__(12));
	
	/**
	* Slider
	*
	* @description Horizontal or vertical slider with settable interaction modes.
	*
	* @demo <span nexus-ui="slider" step=0.2></span>
	*
	* @example
	* var slider = new Nexus.Slider('#target')
	*
	* @example
	* var slider = new Nexus.Slider('#target',{
	*     'size': [120,20],
	*     'mode': 'relative',  // 'relative' or 'absolute'
	*     'min': 0,
	*     'max': 1,
	*     'step': 0,
	*     'value': 0
	* })
	*
	* @output
	* change
	* Fires when the interface's value changes. <br>
	* Event data: <i>number</i> The number value of the interface.
	*
	* @outputexample
	* slider.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*
	*/
	
	var Slider = (function (_Interface) {
	  function Slider() {
	    _classCallCheck(this, Slider);
	
	    var options = ["min", "max", "value"];
	
	    var defaults = {
	      size: [120, 20],
	      mode: "relative", // 'relative' or 'absolute'
	      min: 0,
	      max: 1,
	      step: 0,
	      value: 0
	    };
	
	    _get(Object.getPrototypeOf(Slider.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.orientation = "vertical"; // This will change automatically to 'horizontal'if the interface is wider than it is tall.
	
	    this._value = new Step(this.settings.min, this.settings.max, this.settings.step, this.settings.value);
	
	    this.position = new Interaction.Handle(this.settings.mode, this.orientation, [0, this.width], [this.height, 0]);
	    this.position.value = this._value.normalized;
	
	    this.init();
	
	    this.position.direction = this.orientation;
	
	    this.emit("change", this.value);
	  }
	
	  _inherits(Slider, _Interface);
	
	  _createClass(Slider, {
	    buildInterface: {
	      value: function buildInterface() {
	
	        this.bar = svg.create("rect");
	        this.fillbar = svg.create("rect");
	        this.knob = svg.create("circle");
	
	        this.element.appendChild(this.bar);
	        this.element.appendChild(this.fillbar);
	        this.element.appendChild(this.knob);
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        if (this.width < this.height) {
	          this.orientation = "vertical";
	          this.position.direction = "vertical";
	        } else {
	          this.orientation = "horizontal";
	          this.position.direction = "horizontal";
	        }
	
	        if (this.position) {
	          this.position.resize([0, this.width], [this.height, 0]);
	        }
	
	        var x = undefined,
	            y = undefined,
	            w = undefined,
	            h = undefined,
	            barOffset = undefined,
	            cornerRadius = undefined;
	        this.knobData = {
	          level: 0,
	          r: 0
	        };
	
	        if (this.orientation === "vertical") {
	          this.thickness = this.width / 2;
	          x = this.width / 2;
	          y = 0;
	          w = this.thickness;
	          h = this.height;
	          this.knobData.r = this.thickness * 0.8;
	          this.knobData.level = h - this.knobData.r - this.normalized * (h - this.knobData.r * 2);
	          barOffset = "translate(" + this.thickness * -1 / 2 + ",0)";
	          cornerRadius = w / 2;
	        } else {
	          this.thickness = this.height / 2;
	          x = 0;
	          y = this.height / 2;
	          w = this.width;
	          h = this.thickness;
	          this.knobData.r = this.thickness * 0.8;
	          this.knobData.level = this.normalized * (w - this.knobData.r * 2) + this.knobData.r;
	          barOffset = "translate(0," + this.thickness * -1 / 2 + ")";
	          cornerRadius = h / 2;
	        }
	
	        this.bar.setAttribute("x", x);
	        this.bar.setAttribute("y", y);
	        this.bar.setAttribute("transform", barOffset);
	        this.bar.setAttribute("rx", cornerRadius); // corner radius
	        this.bar.setAttribute("ry", cornerRadius);
	        this.bar.setAttribute("width", w);
	        this.bar.setAttribute("height", h);
	
	        if (this.orientation === "vertical") {
	          this.fillbar.setAttribute("x", x);
	          this.fillbar.setAttribute("y", this.knobData.level);
	          this.fillbar.setAttribute("width", w);
	          this.fillbar.setAttribute("height", h - this.knobData.level);
	        } else {
	          this.fillbar.setAttribute("x", 0);
	          this.fillbar.setAttribute("y", y);
	          this.fillbar.setAttribute("width", this.knobData.level);
	          this.fillbar.setAttribute("height", h);
	        }
	        this.fillbar.setAttribute("transform", barOffset);
	        this.fillbar.setAttribute("rx", cornerRadius);
	        this.fillbar.setAttribute("ry", cornerRadius);
	
	        if (this.orientation === "vertical") {
	          this.knob.setAttribute("cx", x);
	          this.knob.setAttribute("cy", this.knobData.level);
	        } else {
	          this.knob.setAttribute("cx", this.knobData.level);
	          this.knob.setAttribute("cy", y);
	        }
	        this.knob.setAttribute("r", this.knobData.r);
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        this.bar.setAttribute("fill", this.colors.fill);
	        this.fillbar.setAttribute("fill", this.colors.accent);
	        this.knob.setAttribute("fill", this.colors.accent);
	      }
	    },
	    render: {
	      value: function render() {
	        if (!this.clicked) {
	          this.knobData.r = this.thickness * 0.75;
	        }
	        this.knob.setAttribute("r", this.knobData.r);
	
	        if (this.orientation === "vertical") {
	          this.knobData.level = this.knobData.r + this._value.normalized * (this.height - this.knobData.r * 2);
	          this.knob.setAttribute("cy", this.height - this.knobData.level);
	          this.fillbar.setAttribute("y", this.height - this.knobData.level);
	          this.fillbar.setAttribute("height", this.knobData.level);
	        } else {
	          this.knobData.level = this._value.normalized * (this.width - this.knobData.r * 2) + this.knobData.r;
	          this.knob.setAttribute("cx", this.knobData.level);
	          this.fillbar.setAttribute("x", 0);
	          this.fillbar.setAttribute("width", this.knobData.level);
	        }
	      }
	    },
	    click: {
	      value: function click() {
	        this.knobData.r = this.thickness * 0.9;
	        this.position.anchor = this.mouse;
	        this.move();
	      }
	    },
	    move: {
	      value: function move() {
	        if (this.clicked) {
	          this.position.update(this.mouse);
	          this._value.updateNormal(this.position.value);
	          this.emit("change", this._value.value);
	          this.render();
	        }
	      }
	    },
	    release: {
	      value: function release() {
	        this.render();
	      }
	    },
	    normalized: {
	      get: function () {
	        return this._value.normalized;
	      }
	    },
	    value: {
	
	      /**
	      The slider's current value. If set manually, will update the interface and trigger the output event.
	      @type {number}
	      @example slider.value = 10;
	      */
	
	      get: function () {
	        return this._value.value;
	      },
	      set: function (v) {
	        this._value.update(v);
	        this.position.value = this._value.normalized;
	        this.emit("change", this._value.value);
	        this.render();
	      }
	    },
	    min: {
	
	      /**
	      Lower limit of the sliders's output range
	      @type {number}
	      @example slider.min = 1000;
	      */
	
	      get: function () {
	        return this._value.min;
	      },
	      set: function (v) {
	        this._value.min = v;
	      }
	    },
	    max: {
	
	      /**
	      Upper limit of the slider's output range
	      @type {number}
	      @example slider.max = 1000;
	      */
	
	      get: function () {
	        return this._value.max;
	      },
	      set: function (v) {
	        this._value.max = v;
	      }
	    },
	    step: {
	
	      /**
	      The increment that the slider's value changes by.
	      @type {number}
	      @example slider.step = 5;
	      */
	
	      get: function () {
	        return this._value.step;
	      },
	      set: function (v) {
	        this._value.step = v;
	      }
	    },
	    mode: {
	
	      /**
	      Absolute mode (slider's value jumps to mouse click position) or relative mode (mouse drag changes value relative to its current position). Default: "relative".
	      @type {string}
	      @example slider.mode = "relative";
	      */
	
	      get: function () {
	        return this.position.mode;
	      },
	      set: function (v) {
	        this.position.mode = v;
	      }
	    }
	  });
	
	  return Slider;
	})(Interface);
	
	module.exports = Slider;

/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var ToggleModel = __webpack_require__(13);
	var Interface = __webpack_require__(6);
	
	/**
	* Toggle
	*
	* @description Binary switch
	*
	* @demo <span nexus-ui="toggle"></span>
	*
	* @example
	* var toggle = new Nexus.Toggle('#target')
	*
	* @example
	* var toggle = new Nexus.Toggle('#target',{
	*     'size': [40,20],
	*     'state': false
	* })
	*
	* @output
	* change
	* Fires any time the interface's value changes. <br>
	* Parameter: The boolean state of the interface.
	*
	* @outputexample
	* toggle.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*
	*/
	
	var Toggle = (function (_Interface) {
	  function Toggle() {
	    _classCallCheck(this, Toggle);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [40, 20],
	      target: false,
	      state: false
	    };
	
	    _get(Object.getPrototypeOf(Toggle.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this._state = new ToggleModel(this.settings.state);
	
	    this.init();
	  }
	
	  _inherits(Toggle, _Interface);
	
	  _createClass(Toggle, {
	    buildInterface: {
	      value: function buildInterface() {
	
	        this.bar = svg.create("rect");
	        this.knob = svg.create("circle");
	        this.element.appendChild(this.bar);
	        this.element.appendChild(this.knob);
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        if (this.height < this.width / 2) {
	          this.knobSize = this.height / 2;
	        } else {
	          this.knobSize = this.width / 4;
	        }
	
	        this.bar.setAttribute("x", this.width / 2 - this.knobSize * 1.5);
	        this.bar.setAttribute("y", this.height / 2 - this.knobSize / 2);
	        this.bar.setAttribute("rx", this.knobSize / 2);
	        this.bar.setAttribute("ry", this.knobSize / 2);
	        this.bar.setAttribute("width", this.knobSize * 3);
	        this.bar.setAttribute("height", this.knobSize);
	
	        this.knob.setAttribute("cx", this.width / 2 - this.knobSize);
	        this.knob.setAttribute("cy", this.height / 2);
	        this.knob.setAttribute("r", this.knobSize);
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        this.knob.setAttribute("fill", this.colors.accent);
	        this.render();
	      }
	    },
	    render: {
	      value: function render() {
	        if (!this.state) {
	          this.knob.setAttribute("cx", this.width / 2 - this.knobSize);
	          this.bar.setAttribute("fill", this.colors.fill);
	        } else {
	          this.knob.setAttribute("cx", this.width / 2 + this.knobSize);
	          this.bar.setAttribute("fill", this.colors.accent);
	        }
	      }
	    },
	    click: {
	      value: function click() {
	        this.flip();
	        this.render();
	        this.emit("change", this.state);
	      }
	    },
	    state: {
	
	      /**
	      Whether the toggle is currently on or off. Setting this property will update the toggle interface and trigger the output event.
	      @type {boolean}
	      @example toggle.state = false;
	      */
	
	      get: function () {
	        return this._state.state;
	      },
	      set: function (value) {
	        this._state.flip(value);
	        this.emit("change", this.state);
	        this.render();
	      }
	    },
	    flip: {
	
	      /**
	      * Switch the toggle state to its opposite state
	      * @example
	      * toggle.flip();
	      */
	
	      value: function flip() {
	        this._state.flip();
	        this.render();
	      }
	    }
	  });
	
	  return Toggle;
	})(Interface);
	
	module.exports = Toggle;

/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var ButtonTemplate = __webpack_require__(17);
	
	/**
	* Button
	*
	* @description Circular button with optional aftertouch.
	*
	* @demo <span nexus-ui="button"></span>
	*
	* @example
	* var button = new Nexus.Button('#target')
	*
	* @example
	* var button = new Nexus.Button('#target',{
	*   'size': [80,80],
	*   'mode': 'aftertouch',
	*   'state': false
	* })
	*
	* @output
	* change
	* Fires any time the interface's value changes. <br>
	* In <b>button mode</b>, <b>toggle mode</b>, and <b>impulse mode</b>, the output data is a boolean describing the state of the button.<br>
	* In <b>aftertouch mode</b>, the output data is an object containing x (0-1) and y (0-1) positions of aftertouch.
	*
	* @outputexample
	* button.on('change',function(v) {
	*   // v is the value of the button
	*   console.log(v);
	* })
	*
	*/
	
	var Button = (function (_ButtonTemplate) {
	  function Button() {
	    _classCallCheck(this, Button);
	
	    var options = ["mode"];
	
	    var defaults = {
	      size: [80, 80],
	      mode: "aftertouch", // button, aftertouch, impulse, toggle
	      state: false
	    };
	
	    _get(Object.getPrototypeOf(Button.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    /**
	    * Interaction mode: supports "button", "aftertouch", "impulse", or "toggle"
	    * @type {string}
	    * @example button.mode = 'toggle';
	    */
	    this.mode = this.settings.mode;
	
	    this.init();
	    this.render();
	  }
	
	  _inherits(Button, _ButtonTemplate);
	
	  _createClass(Button, {
	    buildInterface: {
	      value: function buildInterface() {
	        this.pad = svg.create("circle");
	        this.element.appendChild(this.pad);
	
	        this.interactionTarget = this.pad;
	
	        // only used if in 'aftertouch' mode
	        this.defs = svg.create("defs");
	        this.element.appendChild(this.defs);
	
	        this.gradient = svg.radialGradient(this.defs, 2);
	
	        this.gradient.stops[0].setAttribute("offset", "30%");
	
	        this.gradient.stops[1].setAttribute("offset", "100%");
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        this.pad.setAttribute("cx", this.width / 2);
	        this.pad.setAttribute("cy", this.height / 2);
	        this.pad.setAttribute("r", Math.min(this.width, this.height) / 2 - this.width / 40);
	        this.pad.setAttribute("stroke-width", this.width / 20);
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	
	        this.gradient.stops[0].setAttribute("stop-color", this.colors.accent);
	        this.gradient.stops[1].setAttribute("stop-color", this.colors.fill);
	        this.render();
	      }
	    },
	    render: {
	
	      /*
	      * Update the visual interface using its current state
	      *
	      * @example
	      * button.render();
	      */
	
	      value: function render() {
	        if (!this.state) {
	          this.pad.setAttribute("fill", this.colors.fill);
	          this.pad.setAttribute("stroke", this.colors.mediumLight);
	        } else {
	          if (this.mode === "aftertouch") {
	            this.pad.setAttribute("stroke", "url(#" + this.gradient.id + ")");
	            this.gradient.element.setAttribute("cx", this.position.x * 100 + "%");
	            this.gradient.element.setAttribute("cy", (1 - this.position.y) * 100 + "%");
	          } else {
	            this.pad.setAttribute("stroke", this.colors.accent);
	          }
	          this.pad.setAttribute("fill", this.colors.accent);
	        }
	      }
	    }
	  });
	
	  return Button;
	})(ButtonTemplate);
	
	module.exports = Button;

/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var math = __webpack_require__(5);
	var ToggleModel = __webpack_require__(13);
	var Interface = __webpack_require__(6);
	
	/**
	Button Template
	*/
	
	var ButtonTemplate = (function (_Interface) {
	  function ButtonTemplate(args, options, defaults) {
	    _classCallCheck(this, ButtonTemplate);
	
	    _get(Object.getPrototypeOf(ButtonTemplate.prototype), "constructor", this).call(this, args, options, defaults);
	
	    this.mode = this.settings.mode || "button";
	
	    this.position = {
	      x: 0,
	      y: 0
	    };
	
	    this._state = new ToggleModel(this.settings.state);
	  }
	
	  _inherits(ButtonTemplate, _Interface);
	
	  _createClass(ButtonTemplate, {
	    buildInterface: {
	      value: function buildInterface() {
	        this.pad = svg.create("circle");
	        this.pad.setAttribute("fill", "#d18");
	        this.pad.setAttribute("stroke", "#d18");
	        this.pad.setAttribute("stroke-width", 4);
	
	        this.element.appendChild(this.pad);
	
	        this.interactionTarget = this.pad;
	
	        this.sizeInterface();
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	        this.pad.setAttribute("cx", this.width / 2);
	        this.pad.setAttribute("cy", this.height / 2);
	        this.pad.setAttribute("r", Math.min(this.width, this.height) / 2 - 2);
	      }
	    },
	    render: {
	      value: function render() {
	        if (!this.state) {
	          this.pad.setAttribute("fill", this.colors.fill);
	          this.pad.setAttribute("stroke", this.colors.mediumLight);
	        } else {
	          this.pad.setAttribute("fill", this.colors.accent);
	          this.pad.setAttribute("stroke", this.colors.accent);
	        }
	      }
	    },
	    down: {
	      value: function down(paintbrush) {
	        switch (this.mode) {
	          case "impulse":
	            this.turnOn();
	            if (this.timeout) {
	              clearTimeout(this.timeout);
	            }
	            this.timeout = setTimeout(this.turnOff.bind(this), 30);
	            //    this.emit('change',this.state);
	            break;
	          case "button":
	            this.turnOn();
	            //    this.emit('change',this.state);
	            break;
	          case "aftertouch":
	            this.position = {
	              x: math.clip(this.mouse.x / this.width, 0, 1),
	              y: math.clip(1 - this.mouse.y / this.height, 0, 1)
	            };
	            this.turnOn();
	            //    this.emit('change',{
	            //      state: this.state,
	            //      x: this.position.x,
	            //      y: this.position.y,
	            //    });
	            break;
	          case "toggle":
	            this.flip(paintbrush);
	            //    this.emit('change',this.state);
	            break;
	        }
	      }
	    },
	    bend: {
	      value: function bend(mouse) {
	        if (this.mode === "aftertouch") {
	          this.mouse = mouse || this.mouse;
	          this.position = {
	            x: math.clip(this.mouse.x / this.width, 0, 1),
	            y: math.clip(1 - this.mouse.y / this.height, 0, 1)
	          };
	          this.emit("change", {
	            state: this.state,
	            x: this.position.x,
	            y: this.position.y });
	          this.render();
	        }
	      }
	    },
	    up: {
	      value: function up() {
	        switch (this.mode) {
	          case "button":
	            this.turnOff();
	            //  this.emit('change',this.state);
	            break;
	          case "aftertouch":
	            this.turnOff();
	            this.position = {
	              x: math.clip(this.mouse.x / this.width, 0, 1),
	              y: math.clip(1 - this.mouse.y / this.height, 0, 1)
	            };
	            //  this.emit('change',{
	            //    state: this.state,
	            //    x: this.position.x,
	            //    y: this.position.y,
	            //  });
	            break;
	        }
	      }
	    },
	    click: {
	
	      /* overwritable interaction handlers */
	
	      value: function click() {
	        this.down();
	      }
	    },
	    move: {
	      value: function move() {
	        this.bend();
	      }
	    },
	    release: {
	      value: function release() {
	        this.up();
	      }
	    },
	    state: {
	
	      /**
	      Whether the button is on (pressed) or off (not pressed)
	      @type {boolean}
	      @example button.state = true;
	      */
	
	      get: function () {
	        return this._state.state;
	      },
	      set: function (value) {
	        this._state.flip(value);
	        if (this.mode === "aftertouch") {
	          this.emit("change", {
	            state: this.state,
	            x: this.position.x,
	            y: this.position.y });
	        } else {
	          this.emit("change", this.state);
	        }
	        this.render();
	      }
	    },
	    flip: {
	
	      /**
	      Change the button to its alternate state (off=>on, on=>off), or flip it to a specified state.
	      @param value {boolean} (Optional) State to flip to.
	      @example button.flip();
	      */
	
	      value: function flip(value) {
	        this._state.flip(value);
	        if (this.mode === "aftertouch") {
	          this.emit("change", {
	            state: this.state,
	            x: this.position.x,
	            y: this.position.y });
	        } else {
	          this.emit("change", this.state);
	        }
	        this.render();
	      }
	    },
	    turnOn: {
	
	      /**
	      Turn the button's state to true.
	      @example button.turnOn();
	      */
	
	      value: function turnOn(emitting) {
	        this._state.on();
	        if (emitting !== false) {
	          if (this.mode === "aftertouch") {
	            this.emit("change", {
	              state: this.state,
	              x: this.position.x,
	              y: this.position.y });
	          } else {
	            this.emit("change", this.state);
	          }
	        }
	        this.render();
	      }
	    },
	    turnOff: {
	
	      /**
	      Turn the button's state to false.
	      @example button.turnOff();
	      */
	
	      value: function turnOff(emitting) {
	        this._state.off();
	        if (emitting !== false) {
	          if (this.mode === "aftertouch") {
	            this.emit("change", {
	              state: this.state,
	              x: this.position.x,
	              y: this.position.y });
	          } else {
	            this.emit("change", this.state);
	          }
	        }
	        this.render();
	      }
	    }
	  });
	
	  return ButtonTemplate;
	})(Interface);
	
	module.exports = ButtonTemplate;

/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var ButtonTemplate = __webpack_require__(17);
	
	/**
	* TextButton
	*
	* @description Text button
	*
	* @demo <span nexus-ui="textButton"></span>
	*
	* @example
	* var textbutton = new Nexus.TextButton('#target')
	*
	* @example
	* var textbutton = new Nexus.TextButton('#target',{
	*     'size': [150,50],
	*     'state': false,
	*     'text': 'Play',
	*     'alternateText': 'Stop'
	* })
	*
	* @output
	* change
	* Fires any time the interface's value changes. <br>
	* The event data is a <i>string</i> of the text on the button at the moment it was clicked.
	*
	* @outputexample
	* textbutton.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*/
	
	var TextButton = (function (_ButtonTemplate) {
	  function TextButton() {
	    _classCallCheck(this, TextButton);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [150, 50],
	      state: false,
	      text: "Play"
	    };
	
	    _get(Object.getPrototypeOf(TextButton.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this._text = this.settings.text;
	
	    if (this.settings.alternate) {
	      //TODO: Remove this conditional in a breaking-changes release
	      this.settings.alternateText = this.settings.alternate;
	      console.warn("'alternate' initiator is deprecated. Use 'alternateText' instead.");
	    }
	    this._alternateText = this.settings.alternateText;
	    this.mode = this.settings.alternateText ? "toggle" : "button";
	    this.init();
	    this.render();
	
	    this.state = this.settings.state;
	  }
	
	  _inherits(TextButton, _ButtonTemplate);
	
	  _createClass(TextButton, {
	    buildFrame: {
	      value: function buildFrame() {
	
	        this.element = document.createElement("div");
	        this.parent.appendChild(this.element);
	
	        this.textElement = document.createElement("div");
	        this.textElement.innerHTML = this._text;
	        this.element.appendChild(this.textElement);
	      }
	    },
	    buildInterface: {
	      value: function buildInterface() {}
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        this.element.style.color = this.colors.dark;
	        this.render();
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	        var textsize = this.height / 3;
	        var textsize2 = this.width / (this._text.length + 2);
	        textsize = Math.min(textsize, textsize2);
	        if (this.alternateText) {
	          var textsize3 = this.width / (this.alternateText.length + 2);
	          textsize = Math.min(textsize, textsize3);
	        }
	        var styles = "width: " + this.width + "px;";
	        styles += "height: " + this.height + "px;";
	        styles += "padding: " + (this.height - textsize) / 2 + "px 0px;";
	        styles += "box-sizing: border-box;";
	        styles += "text-align: center;";
	        styles += "font-family: inherit;";
	        styles += "font-weight: 700;";
	        styles += "opacity: 1;";
	        styles += "font-size:" + textsize + "px;";
	        this.textElement.style.cssText = styles;
	        this.render();
	      }
	    },
	    render: {
	      value: function render() {
	        if (!this.state) {
	          this.element.style.backgroundColor = this.colors.fill;
	          this.textElement.style.color = this.colors.dark;
	          this.textElement.innerHTML = this._text;
	        } else {
	          this.element.style.backgroundColor = this.colors.accent;
	          this.textElement.style.color = this.colors.fill;
	          if (this.alternateText) {
	            this.textElement.innerHTML = this._alternateText;
	          } else {
	            this.textElement.innerHTML = this._text;
	          }
	        }
	      }
	    },
	    alternateText: {
	
	      /**
	      The text to display when the button is in its "on" state. If set, this puts the button in "toggle" mode.
	      @type {String}
	      */
	
	      get: function () {
	        return this._alternateText;
	      },
	      set: function (text) {
	        if (text) {
	          this.mode = "toggle";
	        } else {
	          this.mode = "button";
	        }
	        this._alternateText = text;
	        this.render();
	      }
	    },
	    text: {
	
	      /**
	      The text to display. (If .alternateText exists, then this .text will only be displayed when the button is in its "off" state.)
	      @type {String}
	      */
	
	      get: function () {
	        return this._text;
	      },
	      set: function (text) {
	        this._text = text;
	        this.sizeInterface();
	        this.render();
	      }
	    }
	  });
	
	  return TextButton;
	})(ButtonTemplate);
	
	module.exports = TextButton;

/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	//let svg = require('../util/svg');
	var Interface = __webpack_require__(6);
	var Button = __webpack_require__(16);
	
	/**
	 * RadioButton
	 *
	 * @description An array of buttons. By default, selecting one button will deselect all other buttons, but this can be customized using the API below.
	 *
	 * @demo <div nexus-ui="RadioButton"></div>
	 *
	 * @example
	 * var radiobutton = new Nexus.RadioButton('#target')
	 *
	 * @example
	 * var radiobutton = new Nexus.RadioButton('#target',{
	 *   'size': [120,25],
	 *   'numberOfButtons': 4,
	 *   'active': -1
	 * })
	 *
	 * @output
	 * change
	 * Fires any time the interface's value changes. <br>
	 * The event data an <i>integer</i>, the index of the button that is currently on. If no button is selected, the value will be -1.
	 *
	 * @outputexample
	 * radiobutton.on('change',function(v) {
	 *   console.log(v);
	 * })
	 *
	 */
	
	var RadioButton = (function (_Interface) {
	  function RadioButton() {
	    _classCallCheck(this, RadioButton);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [120, 25],
	      numberOfButtons: 4,
	      active: -1
	    };
	
	    _get(Object.getPrototypeOf(RadioButton.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.buttons = [];
	    this._numberOfButtons = this.settings.numberOfButtons;
	    this.active = this.settings.active;
	
	    this.init();
	    this.render();
	  }
	
	  _inherits(RadioButton, _Interface);
	
	  _createClass(RadioButton, {
	    buildFrame: {
	      value: function buildFrame() {
	        this.element = document.createElement("div");
	        this.parent.appendChild(this.element);
	      }
	    },
	    buildInterface: {
	      value: function buildInterface() {
	        for (var i = 0; i < this._numberOfButtons; i++) {
	          var container = document.createElement("span");
	
	          var button = new Button(container, {
	            mode: "toggle",
	            component: true
	          }, this.update.bind(this, i));
	
	          this.buttons.push(button);
	          this.element.appendChild(container);
	        }
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	        var orientation = undefined;
	        if (this.width > this.height) {
	          orientation = "horizontal";
	        } else {
	          orientation = "vertical";
	        }
	
	        var buttonWidth = this.width / (orientation === "vertical" ? 1 : this._numberOfButtons);
	        var buttonHeight = this.height / (orientation === "vertical" ? this._numberOfButtons : 1);
	
	        for (var i = 0; i < this._numberOfButtons; i++) {
	          this.buttons[i].resize(buttonWidth, buttonHeight);
	        }
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        for (var i = 0; i < this._numberOfButtons; i++) {
	          this.buttons[i].colors = this.colors;
	          this.buttons[i].render();
	        }
	      }
	    },
	    update: {
	      value: function update(index) {
	        if (this.buttons[index].state) {
	          this.select(index);
	        } else {
	          this.deselect();
	        }
	        //  this.render();
	      }
	    },
	    render: {
	      value: function render() {
	        for (var i = 0; i < this.buttons.length; i++) {
	          if (i === this.active) {
	            this.buttons[i].turnOn(false);
	          } else {
	            this.buttons[i].turnOff(false);
	          }
	        }
	      }
	    },
	    select: {
	
	      /**
	      Select one button and deselect all other buttons.
	      @param index {number} The index of the button to select
	      */
	
	      value: function select(index) {
	        if (index >= 0 && index < this.buttons.length) {
	          this.active = index;
	          this.emit("change", this.active);
	          this.render();
	        }
	      }
	    },
	    deselect: {
	
	      /**
	      Deselect all buttons.
	      */
	
	      value: function deselect() {
	        this.active = -1;
	        this.emit("change", this.active);
	        this.render();
	      }
	    },
	    numberOfButtons: {
	      get: function () {
	        return this._numberOfButtons;
	      },
	
	      /**
	       * Update how many buttons are in the interface
	       * @param  {number} buttons How many buttons are in the interface
	       */
	      set: function (buttons) {
	        this._numberOfButtons = buttons;
	        for (var i = 0; i < this.buttons.length; i++) {
	          this.buttons[i].destroy();
	        }
	        this.buttons = [];
	        //  for (let i=0;i<this.buttons.length;i++) {
	        //    this.buttons[i].destroy();
	        //  }
	        this.empty();
	        this.buildInterface();
	      }
	    }
	  });
	
	  return RadioButton;
	})(Interface);
	
	module.exports = RadioButton;

/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var Interface = __webpack_require__(6);
	var Step = __webpack_require__(11);
	var math = __webpack_require__(5);
	var util = __webpack_require__(8);
	
	/**
	* Number
	*
	* @description Number interface which is controllable by dragging or typing.
	*
	* @demo <span nexus-ui="number"></span>
	*
	* @example
	* var number = new Nexus.Number('#target')
	*
	* @example
	* var number = new Nexus.Number('#target',{
	*   'size': [60,30],
	*   'value': 0,
	*   'min': 0,
	*   'max': 20000,
	*   'step': 1
	* })
	*
	* @output
	* change
	* Fires any time the interface's value changes. <br>
	* The event data is the number value of the interface.
	*
	* @outputexample
	* number.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*
	*/
	
	var Number = (function (_Interface) {
	  function Number() {
	    _classCallCheck(this, Number);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [60, 30],
	      value: 0,
	      min: 0,
	      max: 20000,
	      step: 1
	    };
	
	    _get(Object.getPrototypeOf(Number.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this._value = new Step(this.settings.min, this.settings.max, this.settings.step, this.settings.value);
	
	    /*
	    Default: 2. How many decimal places to clip the number's visual rendering to. This does not affect number's actual value output -- for that, set the step property to .01, .1, or 1.
	    @type {number}
	    @example number.decimalPlaces = 2;
	    */
	    this.decimalPlaces = 2;
	    this.actual = 0;
	
	    this.max = this._value.max;
	
	    this.min = this._value.min;
	
	    this.step = this._value.step;
	
	    this.init();
	    this.render();
	  }
	
	  _inherits(Number, _Interface);
	
	  _createClass(Number, {
	    buildFrame: {
	      value: function buildFrame() {
	        this.element = document.createElement("input");
	        this.element.type = "text";
	
	        this.element.addEventListener("blur", (function () {
	          this.element.style.backgroundColor = this.colors.fill;
	          this.element.style.color = this.colors.dark;
	          if (this.element.value !== this.value) {
	            this.value = parseFloat(this.element.value);
	            this.render();
	          }
	        }).bind(this));
	
	        util.setInputFilter(this.element, function (value) {
	          return /^-?\d*\.?\d*$/.test(value);
	        });
	
	        this.element.addEventListener("keydown", (function (e) {
	          if (e.which === 13) {
	            this.element.blur();
	            this.value = this.element.value;
	            this.emit("change", this.value);
	            this.render();
	          }
	        }).bind(this), true);
	
	        this.parent.appendChild(this.element);
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        this._minDimension = Math.min(this.width, this.height);
	
	        var styles = "width: " + this.width + "px;";
	        styles += "height: " + this.height + "px;";
	        styles += "background-color: #e7e7e7;";
	        styles += "color: #333;";
	        styles += "font-family: arial;";
	        styles += "font-weight: 500;";
	        styles += "font-size:" + this._minDimension / 2 + "px;";
	        //  styles += 'highlight: #d18;';
	        styles += "border: none;";
	        styles += "outline: none;";
	        styles += "padding: " + this._minDimension / 4 + "px " + this._minDimension / 4 + "px;";
	        styles += "box-sizing: border-box;";
	        styles += "userSelect: text;";
	        styles += "mozUserSelect: text;";
	        styles += "webkitUserSelect: text;";
	        this.element.style.cssText += styles;
	
	        // to add eventually
	        // var css = '#'+this.elementID+'::selection{ background-color: transparent }';
	
	        this.element.value = this.value;
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        this.element.style.backgroundColor = this.colors.fill;
	        this.element.style.color = this.colors.dark;
	      }
	    },
	    render: {
	      value: function render() {
	
	        this.element.value = math.prune(this.value, this.decimalPlaces);
	      }
	    },
	    click: {
	      value: function click() {
	        this.hasMoved = false;
	        this.element.readOnly = true;
	        this.actual = this.value;
	        this.initial = { y: this.mouse.y };
	        this.changeFactor = math.invert(this.mouse.x / this.width);
	      }
	    },
	    move: {
	      value: function move() {
	        this.hasMoved = true;
	        if (this.clicked) {
	
	          var newvalue = this.actual - (this.mouse.y - this.initial.y) * (math.clip(this.max - this.min, 0, 1000) / 200) * Math.pow(this.changeFactor, 2);
	          this.value = newvalue;
	
	          this.render();
	          if (this._value.changed) {
	            this.emit("change", this.value);
	          }
	        }
	      }
	    },
	    release: {
	      value: function release() {
	        if (!this.hasMoved) {
	          this.element.readOnly = false;
	          this.element.focus();
	          this.element.setSelectionRange(0, this.element.value.length);
	          this.element.style.backgroundColor = this.colors.accent;
	          this.element.style.color = this.colors.light;
	        } else {
	          document.body.focus();
	        }
	      }
	    },
	    link: {
	
	      /**
	      Connect this number interface to a dial or slider
	      @param {Interface} element Element to connect to.
	      @example number.link(slider)
	      */
	
	      value: function link(destination) {
	        var _this = this;
	
	        this.min = destination.min;
	        this.max = destination.max;
	        this.step = destination.step;
	        destination.on("change", function (v) {
	          _this.passiveUpdate(v);
	        });
	        this.on("change", function (v) {
	          destination.value = v;
	        });
	        this.value = destination.value;
	        /*  return {
	            listener1: listener1,
	            listener2: listener2,
	            destroy: () => {
	              listener1.remove() (or similar)
	              listener2.remove() (or similar)
	            }
	          } */
	      }
	    },
	    passiveUpdate: {
	      value: function passiveUpdate(v) {
	        this._value.update(v);
	        this.render();
	      }
	    },
	    value: {
	
	      /**
	      The interface's current value. If set manually, will update the interface and trigger the output event.
	      @type {number}
	      @example number.value = 10;
	      */
	
	      get: function () {
	        return this._value.value;
	      },
	      set: function (v) {
	        this._value.update(v);
	        this.emit("change", this.value);
	        this.render();
	      }
	    },
	    min: {
	
	      /**
	      Lower limit of the number's output range
	      @type {number}
	      @example number.min = 1000;
	      */
	
	      get: function () {
	        return this._value.min;
	      },
	      set: function (v) {
	        this._value.min = v;
	      }
	    },
	    max: {
	
	      /**
	      Upper limit of the number's output range
	      @type {number}
	      @example number.max = 1000;
	      */
	
	      get: function () {
	        return this._value.max;
	      },
	      set: function (v) {
	        this._value.max = v;
	      }
	    },
	    step: {
	
	      /**
	      The increment that the number's value changes by.
	      @type {number}
	      @example number.step = 5;
	      */
	
	      get: function () {
	        return this._value.step;
	      },
	      set: function (v) {
	        this._value.step = v;
	      }
	    }
	  });
	
	  return Number;
	})(Interface);
	
	module.exports = Number;

/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var Interface = __webpack_require__(6);
	
	/**
	* Select
	*
	* @description Dropdown menu
	*
	* @demo <span nexus-ui="select"></span>
	*
	* @example
	* var select = new Nexus.Select('#target')
	*
	* @example
	* var select = new Nexus.Select('#target',{
	*   'size': [100,30],
	*   'options': ['default','options']
	* })
	*
	* @output
	* change
	* Fires any time the interface's value changes. <br>
	* The event data is an object containing the text value of the selected option, as well as the numeric index of the selection.
	*
	* @outputexample
	* select.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*
	*/
	
	var Select = (function (_Interface) {
	  function Select() {
	    _classCallCheck(this, Select);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [100, 30],
	      options: ["default", "options"]
	    };
	
	    _get(Object.getPrototypeOf(Select.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this._selectedIndex = -1;
	    this._value = false;
	
	    this._options = this.settings.options;
	
	    this.init();
	    this.render();
	  }
	
	  _inherits(Select, _Interface);
	
	  _createClass(Select, {
	    buildFrame: {
	      value: function buildFrame() {
	        this.element = document.createElement("select");
	        this.element.style.fontSize = this.height / 2 + "px";
	        this.element.style.outline = "none";
	        this.element.style.highlight = "none";
	        this.element.style.width = this.width + "px";
	        this.element.style.height = this.height + "px";
	
	        this.boundRender = this.render.bind(this);
	
	        this.element.addEventListener("change", this.boundRender);
	
	        this.parent.appendChild(this.element);
	      }
	    },
	    attachListeners: {
	      value: function attachListeners() {}
	    },
	    buildInterface: {
	      value: function buildInterface() {
	
	        this.defineOptions();
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        this.element.style.backgroundColor = this.colors.fill;
	        this.element.style.color = this.colors.dark;
	        this.element.style.border = "solid 0px " + this.colors.mediumLight;
	      }
	    },
	    render: {
	      value: function render() {
	
	        this._value = this.element.options[this.element.selectedIndex].text;
	        this._selectedIndex = this.element.selectedIndex;
	        this.emit("change", {
	          value: this._value,
	          index: this._selectedIndex
	        });
	      }
	    },
	    click: {
	      value: function click() {}
	    },
	    move: {
	      value: function move() {}
	    },
	    release: {
	      value: function release() {}
	    },
	    defineOptions: {
	
	      /**
	       * Update the list of options. This removes all existing options and creates a new list of options.
	       * @param  {array} options New array of options
	       */
	
	      value: function defineOptions(options) {
	
	        /*  function removeOptions(selectbox)
	          {
	              var i;
	              for(i = selectbox.options.length - 1 ; i >= 0 ; i--)
	              {
	                  selectbox.remove(i);
	              }
	          }
	          //using the function:
	          removeOptions(document.getElementById("mySelectObject")); */
	
	        if (options) {
	          this._options = options;
	        }
	
	        for (var i = this.element.options.length - 1; i >= 0; i--) {
	          this.element.remove(i);
	        }
	
	        for (var i = 0; i < this._options.length; i++) {
	          this.element.options.add(new Option(this._options[i], i));
	        }
	      }
	    },
	    value: {
	
	      /**
	      The text of the option that is currently selected. If set, will update the interface and trigger the output event.
	      @type {String}
	      @example select.value = "sawtooth";
	      */
	
	      get: function () {
	        return this._value;
	      },
	      set: function (v) {
	        this._value = v;
	        for (var i = 0; i < this.element.options.length; i++) {
	          if (v === this.element.options[i].text) {
	            this.selectedIndex = i;
	            break;
	          }
	        }
	      }
	    },
	    selectedIndex: {
	
	      /**
	      The numeric index of the option that is currently selected. If set, will update the interface and trigger the output event.
	      @type {number}
	      @example select.selectedIndex = 2;
	      */
	
	      get: function () {
	        return this._selectedIndex;
	      },
	      set: function (v) {
	        this._selectedIndex = v;
	        this.element.selectedIndex = v;
	        this.render();
	      }
	    },
	    customDestroy: {
	      value: function customDestroy() {
	        this.element.removeEventListener("change", this.boundRender);
	      }
	    }
	  });
	
	  return Select;
	})(Interface);
	
	module.exports = Select;

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequireWildcard = function (obj) { return obj && obj.__esModule ? obj : { "default": obj }; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var math = __webpack_require__(5);
	var Interface = __webpack_require__(6);
	var Step = __webpack_require__(11);
	
	var Interaction = _interopRequireWildcard(__webpack_require__(12));
	
	/**
	* Dial
	*
	*
	* @description Dial with radial or linear interaction.
	*
	* @demo <span nexus-ui="dial"></span>
	*
	* @example
	* var dial = new Nexus.Dial('#target')
	*
	* @example
	* var dial = new Nexus.Dial('#target',{
	*   'size': [75,75],
	*   'interaction': 'radial', // "radial", "vertical", or "horizontal"
	*   'mode': 'relative', // "absolute" or "relative"
	*   'min': 0,
	*   'max': 1,
	*   'step': 0,
	*   'value': 0
	* })
	*
	* @output
	* change
	* Fires any time the interface's value changes. <br>
	* The event data is the number value of the interface.
	*
	* @outputexample
	* dial.on('change',function(v) {
	*   console.log(v);
	* })
	*
	* @tutorial
	* Dial
	* ygGMxq
	*
	*/
	
	var Dial = (function (_Interface) {
	  function Dial() {
	    _classCallCheck(this, Dial);
	
	    var options = ["min", "max", "value"];
	
	    var defaults = {
	      size: [75, 75],
	      interaction: "radial", // radial, vertical, horizontal
	      mode: "relative", // absolute, relative
	      min: 0,
	      max: 1,
	      step: 0,
	      value: 0
	    };
	
	    _get(Object.getPrototypeOf(Dial.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.interaction = this.settings.interaction;
	
	    this._value = new Step(this.settings.min, this.settings.max, this.settings.step, this.settings.value);
	
	    this.position = new Interaction.Handle(this.settings.mode, this.interaction, [0, this.width], [this.height, 0]);
	
	    this.init();
	
	    this.value = this._value.value;
	
	    this.position.value = this._value.normalized;
	
	    this.previousAngle = false;
	
	    this.emit("change", this.value);
	  }
	
	  _inherits(Dial, _Interface);
	
	  _createClass(Dial, {
	    buildInterface: {
	      value: function buildInterface() {
	
	        this.background = svg.create("circle");
	        this.screw = svg.create("circle");
	        this.handle = svg.create("path");
	        this.handle2 = svg.create("path");
	        this.handleFill = svg.create("path");
	        this.handle2Fill = svg.create("path");
	        this.handleLine = svg.create("path");
	
	        this.element.appendChild(this.background);
	        this.element.appendChild(this.handle);
	        this.element.appendChild(this.handle2);
	        this.element.appendChild(this.handleFill);
	        this.element.appendChild(this.handle2Fill);
	        this.element.appendChild(this.handleLine);
	        this.element.appendChild(this.screw);
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        this.position.resize([0, this.width], [this.height, 0]);
	
	        var center = {
	          x: this.width / 2,
	          y: this.height / 2
	        };
	
	        var diameter = Math.min(this.width, this.height);
	
	        this.background.setAttribute("cx", center.x);
	        this.background.setAttribute("cy", center.y);
	        this.background.setAttribute("r", diameter / 2 - diameter / 40);
	
	        this.screw.setAttribute("cx", center.x);
	        this.screw.setAttribute("cy", center.y);
	        this.screw.setAttribute("r", diameter / 12);
	
	        var value = this.value;
	
	        var handlePoints = {
	          start: Math.PI * 1.5,
	          end: math.clip(math.scale(value, 0, 0.5, Math.PI * 1.5, Math.PI * 0.5), Math.PI * 0.5, Math.PI * 1.5)
	        };
	        var handle2Points = {
	          start: Math.PI * 2.5,
	          end: math.clip(math.scale(value, 0.5, 1, Math.PI * 2.5, Math.PI * 1.5), Math.PI * 1.5, Math.PI * 2.5)
	        };
	
	        var handlePath = svg.arc(center.x, center.y, diameter / 2 - diameter / 40, handlePoints.start, handlePoints.end);
	        var handle2Path = svg.arc(center.x, center.y, diameter / 2 - diameter / 40, handle2Points.start, handle2Points.end);
	
	        this.handle.setAttribute("d", handlePath);
	        this.handle.setAttribute("stroke-width", diameter / 20);
	        this.handle.setAttribute("fill", "none");
	
	        this.handle2.setAttribute("d", handle2Path);
	        this.handle2.setAttribute("stroke-width", diameter / 20);
	        this.handle2.setAttribute("fill", "none");
	
	        handlePath += " L " + center.x + " " + center.y;
	
	        this.handleFill.setAttribute("d", handlePath);
	        this.handleFill.setAttribute("fill-opacity", "0.3");
	
	        handle2Path += " L " + center.x + " " + center.y;
	
	        this.handle2Fill.setAttribute("d", handle2Path);
	        this.handle2Fill.setAttribute("fill-opacity", "0.3");
	
	        var arcEndingA = undefined;
	        if (value < 0.5) {
	          arcEndingA = handlePoints.end;
	        } else {
	          arcEndingA = handle2Points.end;
	        }
	
	        var arcEndingX = center.x + Math.cos(arcEndingA) * (diameter / 2);
	        var arcEndingY = center.y + Math.sin(arcEndingA) * (diameter / 2) * -1;
	
	        this.handleLine.setAttribute("d", "M " + center.x + " " + center.y + " L " + arcEndingX + " " + arcEndingY);
	        this.handleLine.setAttribute("stroke-width", diameter / 20);
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        this.background.setAttribute("fill", this.colors.fill);
	        this.screw.setAttribute("fill", this.colors.accent);
	        this.handle.setAttribute("stroke", this.colors.accent);
	        this.handle2.setAttribute("stroke", this.colors.accent);
	        this.handleFill.setAttribute("fill", this.colors.accent);
	        this.handle2Fill.setAttribute("fill", this.colors.accent);
	        this.handleLine.setAttribute("stroke", this.colors.accent);
	      }
	    },
	    render: {
	      value: function render() {
	        var value = this._value.normalized;
	
	        var center = {
	          x: this.width / 2,
	          y: this.height / 2
	        };
	
	        var diameter = Math.min(this.width, this.height);
	
	        var handlePoints = {
	          start: Math.PI * 1.5,
	          end: math.clip(math.scale(value, 0, 0.5, Math.PI * 1.5, Math.PI * 0.5), Math.PI * 0.5, Math.PI * 1.5)
	        };
	        var handle2Points = {
	          start: Math.PI * 2.5,
	          end: math.clip(math.scale(value, 0.5, 1, Math.PI * 2.5, Math.PI * 1.5), Math.PI * 1.5, Math.PI * 2.5)
	        };
	
	        var handlePath = svg.arc(center.x, center.y, diameter / 2 - diameter / 40, handlePoints.start, handlePoints.end);
	        var handle2Path = svg.arc(center.x, center.y, diameter / 2 - diameter / 40, handle2Points.start, handle2Points.end);
	
	        this.handle.setAttribute("d", handlePath);
	        this.handle2.setAttribute("d", handle2Path);
	
	        handlePath += " L " + center.x + " " + center.y;
	
	        this.handleFill.setAttribute("d", handlePath);
	
	        handle2Path += " L " + center.x + " " + center.y;
	
	        this.handle2Fill.setAttribute("d", handle2Path);
	
	        var arcEndingA = undefined;
	        if (value <= 0.5) {
	          arcEndingA = handlePoints.end;
	        } else {
	          arcEndingA = handle2Points.end;
	        }
	
	        var arcEndingX = center.x + Math.cos(arcEndingA) * (diameter / 2);
	        var arcEndingY = center.y + Math.sin(arcEndingA) * (diameter / 2) * -1;
	
	        this.handleLine.setAttribute("d", "M " + center.x + " " + center.y + " L " + arcEndingX + " " + arcEndingY);
	      }
	    },
	    click: {
	      value: function click() {
	        if (this.mode === "relative") {
	          this.previousAngle = false;
	        }
	        this.position.anchor = this.mouse;
	        this.position.value = this._value.normalized;
	        this.move();
	      }
	    },
	    move: {
	      value: function move() {
	        if (this.clicked) {
	
	          this.position.update(this.mouse);
	
	          var angle = this.position.value * Math.PI * 2;
	
	          if (angle < 0) {
	            angle += Math.PI * 2;
	          }
	
	          if (this.mode === "relative") {
	            if (this.previousAngle !== false && Math.abs(this.previousAngle - angle) > 2) {
	              if (this.previousAngle > 3) {
	                angle = Math.PI * 2;
	              } else {
	                angle = 0;
	              }
	            }
	          } /* else {
	            if (this.previousAngle !== false && Math.abs(this.previousAngle - angle) > 2) {
	              if (this.previousAngle > 3) {
	                angle = Math.PI*2;
	              } else {
	                angle = 0;
	              }
	            }
	            } */
	          this.previousAngle = angle;
	
	          var realValue = angle / (Math.PI * 2);
	
	          this.value = this._value.updateNormal(realValue);
	
	          if (this.mode === "relative") {
	            this.position.value = realValue;
	          }
	
	          this.emit("change", this._value.value);
	
	          this.render();
	        }
	      }
	    },
	    release: {
	      value: function release() {}
	    },
	    value: {
	
	      /*
	      Dial's value. When set, it will automatically be adjust to fit min/max/step settings of the interface.
	      @type {number}
	      @example dial.value = 10;
	       get value() {
	        return this._value.value;
	      }
	       set value(value) {
	        this._value.update(value);
	        this.emit('change',this.value);
	        this.render();
	      }
	      */
	
	      /**
	      Dial's value. When set, it will automatically be adjust to fit min/max/step settings of the interface.
	      @type {number}
	      @example dial.value = 10;
	      */
	
	      get: function () {
	        return this._value.value;
	      },
	      set: function (v) {
	        this._value.update(v);
	        this.position.value = this._value.normalized;
	        this.emit("change", this._value.value);
	        this.render();
	      }
	    },
	    min: {
	
	      /**
	      Lower limit of the dial's output range
	      @type {number}
	      @example dial.min = 1000;
	      */
	
	      get: function () {
	        return this._value.min;
	      },
	      set: function (v) {
	        this._value.min = v;
	      }
	    },
	    max: {
	
	      /**
	      Upper limit of the dial's output range
	      @type {number}
	      @example dial.max = 1000;
	      */
	
	      get: function () {
	        return this._value.max;
	      },
	      set: function (v) {
	        this._value.max = v;
	      }
	    },
	    step: {
	
	      /**
	      The increment that the dial's value changes by.
	      @type {number}
	      @example dial.step = 5;
	      */
	
	      get: function () {
	        return this._value.step;
	      },
	      set: function (v) {
	        this._value.step = v;
	      }
	    },
	    mode: {
	
	      /**
	      Absolute mode (dial's value jumps to mouse click position) or relative mode (mouse drag changes value relative to its current position). Default: "relative".
	      @type {string}
	      @example dial.mode = "relative";
	      */
	
	      get: function () {
	        return this.position.mode;
	      },
	      set: function (v) {
	        this.position.mode = v;
	      }
	    },
	    normalized: {
	
	      /**
	      Normalized value of the dial.
	      @type {number}
	      @example dial.normalized = 0.5;
	      */
	
	      get: function () {
	        return this._value.normalized;
	      },
	      set: function (v) {
	        this._value.updateNormal(v);
	        this.emit("change", this.value);
	      }
	    }
	  });
	
	  return Dial;
	})(Interface);
	
	module.exports = Dial;

/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var Interface = __webpack_require__(6);
	var ButtonTemplate = __webpack_require__(17);
	var touch = __webpack_require__(9);
	
	var PianoKey = (function (_ButtonTemplate) {
	  function PianoKey() {
	    _classCallCheck(this, PianoKey);
	
	    var options = ["value", "note", "color"];
	
	    var defaults = {
	      size: [80, 80],
	      target: false,
	      mode: "button",
	      value: 0
	    };
	
	    _get(Object.getPrototypeOf(PianoKey.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.note = this.settings.note;
	    this.color = this.settings.color;
	
	    this.colors = {
	      w: "#fff",
	      b: "#666" };
	
	    this.init();
	    this.render();
	  }
	
	  _inherits(PianoKey, _ButtonTemplate);
	
	  _createClass(PianoKey, {
	    buildFrame: {
	      value: function buildFrame() {
	        this.element = svg.create("svg");
	        this.element.setAttribute("width", this.width);
	        this.element.setAttribute("height", this.height);
	        this.parent.appendChild(this.element);
	      }
	    },
	    buildInterface: {
	      value: function buildInterface() {
	        var _this = this;
	
	        this.pad = svg.create("rect");
	
	        this.element.appendChild(this.pad);
	
	        this.interactionTarget = this.pad;
	
	        /* events */
	
	        if (!touch.exists) {
	
	          this.click = function () {
	            //  console.log('click');
	            _this.piano.interacting = true;
	            _this.piano.paintbrush = !_this.state;
	            _this.down(_this.piano.paintbrush);
	          };
	
	          this.pad.addEventListener("mouseover", function () {
	            if (_this.piano.interacting) {
	              //    console.log('mouseover');
	              _this.down(_this.piano.paintbrush);
	            }
	          });
	
	          this.move = function () {
	            if (_this.piano.interacting) {
	              //  console.log('move');
	              _this.bend();
	            }
	          };
	
	          this.release = function () {
	            _this.piano.interacting = false;
	            //  console.log('release');
	            //  this.up();
	          };
	          this.pad.addEventListener("mouseup", function () {
	            if (_this.piano.interacting) {
	              //  console.log('mouseup');
	              _this.up();
	            }
	          });
	          this.pad.addEventListener("mouseout", function () {
	            if (_this.piano.interacting) {
	              //  console.log('mouseout');
	              _this.up();
	            }
	          });
	        }
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        //let radius = Math.min(this.width,this.height) / 5;
	        var radius = 0;
	
	        this.pad.setAttribute("x", 0.5);
	        this.pad.setAttribute("y", 0.5);
	        if (this.width > 2) {
	          this.pad.setAttribute("width", this.width - 1);
	        } else {
	          this.pad.setAttribute("width", this.width);
	        }
	        if (this.height > 2) {
	          this.pad.setAttribute("height", this.height);
	        } else {
	          this.pad.setAttribute("height", this.height);
	        }
	        this.pad.setAttribute("rx", radius);
	        this.pad.setAttribute("ry", radius);
	      }
	    },
	    render: {
	      value: function render() {
	        if (!this.state) {
	          this.pad.setAttribute("fill", this.colors[this.color]);
	        } else {
	          this.pad.setAttribute("fill", this.colors.accent);
	        }
	      }
	    }
	  });
	
	  return PianoKey;
	})(ButtonTemplate);
	
	/**
	* Piano
	*
	* @description Piano keyboard interface
	*
	* @demo <div nexus-ui="piano"></div>
	*
	* @example
	* var piano = new Nexus.Piano('#target')
	*
	* @example
	* var piano = new Nexus.Piano('#target',{
	*     'size': [500,125],
	*     'mode': 'button',  // 'button', 'toggle', or 'impulse'
	*     'lowNote': 24,
	*     'highNote': 60
	* })
	*
	* @output
	* change
	* Fires any time a new key is pressed or released <br>
	* The event data is an object containing <i>note</i> and <i>state</i> properties.
	*
	* @outputexample
	* piano.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*/
	
	var Piano = (function (_Interface) {
	  function Piano() {
	    _classCallCheck(this, Piano);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [500, 125],
	      lowNote: 24,
	      highNote: 60,
	      mode: "button"
	    };
	
	    _get(Object.getPrototypeOf(Piano.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.keyPattern = ["w", "b", "w", "b", "w", "w", "b", "w", "b", "w", "b", "w"];
	
	    this.paintbrush = false;
	
	    this.mode = this.settings.mode;
	
	    this.range = {
	      low: this.settings.lowNote,
	      high: this.settings.highNote
	    };
	
	    this.range.size = this.range.high - this.range.low + 1;
	
	    this.keys = [];
	
	    this.toggleTo = false;
	
	    this.init();
	    this.render();
	  }
	
	  _inherits(Piano, _Interface);
	
	  _createClass(Piano, {
	    buildFrame: {
	      value: function buildFrame() {
	        this.element = document.createElement("div");
	        this.element.style.position = "relative";
	        this.element.style.borderRadius = "0px";
	        this.element.style.display = "block";
	        this.element.style.width = "100%";
	        this.element.style.height = "100%";
	        this.parent.appendChild(this.element);
	      }
	    },
	    buildInterface: {
	      value: function buildInterface() {
	
	        this.keys = [];
	
	        for (var i = 0; i < this.range.size; i++) {
	
	          var container = document.createElement("span");
	          var scaleIndex = (i + this.range.low) % this.keyPattern.length;
	
	          var key = new PianoKey(container, {
	            component: true,
	            note: i + this.range.low,
	            color: this.keyPattern[scaleIndex],
	            mode: this.mode
	          }, this.keyChange.bind(this, i + this.range.low));
	
	          key.piano = this;
	
	          if (touch.exists) {
	            key.pad.index = i;
	            key.preClick = key.preMove = key.preRelease = function () {};
	            key.click = key.move = key.release = function () {};
	            key.preTouch = key.preTouchMove = key.preTouchRelease = function () {};
	            key.touch = key.touchMove = key.touchRelease = function () {};
	          }
	
	          this.keys.push(key);
	          this.element.appendChild(container);
	        }
	        if (touch.exists) {
	          this.addTouchListeners();
	        }
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        var keyX = 0;
	
	        var keyPositions = [];
	
	        for (var i = 0; i < this.range.size; i++) {
	
	          keyPositions.push(keyX);
	
	          var scaleIndex = (i + this.range.low) % this.keyPattern.length;
	          var nextScaleIndex = (i + 1 + this.range.low) % this.keyPattern.length;
	          if (i + 1 + this.range.low >= this.range.high) {
	            keyX += 1;
	          } else if (this.keyPattern[scaleIndex] === "w" && this.keyPattern[nextScaleIndex] === "w") {
	            keyX += 1;
	          } else {
	            keyX += 0.5;
	          }
	        }
	        var keysWide = keyX;
	
	        //  let padding = this.width / 120;
	        var padding = 1;
	        var buttonWidth = (this.width - padding * 2) / keysWide;
	        var buttonHeight = (this.height - padding * 2) / 2;
	
	        for (var i = 0; i < this.keys.length; i++) {
	
	          var container = this.keys[i].parent;
	          container.style.position = "absolute";
	          container.style.left = keyPositions[i] * buttonWidth + padding + "px";
	          if (this.keys[i].color === "w") {
	            container.style.top = padding + "px";
	            this.keys[i].resize(buttonWidth, buttonHeight * 2);
	          } else {
	            container.style.zIndex = 1;
	            container.style.top = padding + "px";
	            this.keys[i].resize(buttonWidth, buttonHeight * 1.1);
	          }
	        }
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	
	        // Piano keys don't actually have a stroke border
	        // They have space between them, which shows the Piano bg color
	        this.element.style.backgroundColor = this.colors.mediumLight;
	
	        for (var i = 0; i < this.keys.length; i++) {
	          this.keys[i].colors = {
	            w: this.colors.light,
	            b: this.colors.dark,
	            accent: this.colors.accent,
	            border: this.colors.mediumLight
	          };
	          this.keys[i].colorInterface();
	          this.keys[i].render();
	        }
	      }
	    },
	    keyChange: {
	      value: function keyChange(note, on) {
	        // emit data for any key turning on/off
	        // "note" is the note value
	        // "on" is a boolean whether it is on or off
	        // in aftertouch mode, "on: is an object with state/x/y properties
	        var data = {
	          note: note
	        };
	        if (typeof on === "object") {
	          data.state = on.state;
	          //  data.x = on.x
	          //  data.y = on.y
	        } else {
	          data.state = on;
	        }
	        this.emit("change", data);
	      }
	    },
	    render: {
	
	      /* drag(note,on) {
	        this.emit('change',{
	          note: note,
	          state: on
	        });
	      } */
	
	      value: function render() {}
	    },
	    addTouchListeners: {
	      value: function addTouchListeners() {
	        this.preClick = this.preMove = this.preRelease = function () {};
	        this.click = this.move = this.release = function () {};
	        this.preTouch = this.preTouchMove = this.preTouchRelease = function () {};
	        this.touch = this.touchMove = this.touchRelease = function () {};
	
	        var allActiveTouches = {};
	        var keys = this.keys;
	
	        function cloneTouch(touch) {
	          return { identifier: touch.identifier, clientX: touch.clientX, clientY: touch.clientY };
	        }
	
	        function updateKeyState() {
	          var allActiveKeys = {};
	
	          // Check/set "key-down" status for all keys that are currently touched.
	          Object.keys(allActiveTouches).forEach(function (id) {
	            var touch = allActiveTouches[id];
	            var el = document.elementFromPoint(touch.clientX, touch.clientY);
	            var key = el ? keys[el.index] : null;
	            if (key) {
	              allActiveKeys[el.index] = id;
	              if (!key.state) {
	                key.down();
	              }
	            } else {
	              delete allActiveTouches[id];
	            }
	          });
	
	          // Set "key-up" status for all keys that are untouched.
	          keys.forEach(function (key) {
	            if (key.state && !allActiveKeys[key.pad.index]) {
	              key.up();
	            }
	          });
	        }
	
	        function handleTouchStartAndMove(e) {
	          e.preventDefault();
	          e.stopPropagation();
	          for (var i = 0; i < e.changedTouches.length; i++) {
	            var _touch = e.changedTouches[i];
	            allActiveTouches[_touch.identifier] = cloneTouch(_touch);
	          }
	          updateKeyState();
	        }
	
	        function handleTouchEnd(e) {
	          e.preventDefault();
	          e.stopPropagation();
	          for (var i = 0; i < e.changedTouches.length; i++) {
	            var _touch = e.changedTouches[i];
	            delete allActiveTouches[_touch.identifier];
	          }
	          updateKeyState();
	        }
	
	        this.element.addEventListener("touchstart", handleTouchStartAndMove);
	        this.element.addEventListener("touchmove", handleTouchStartAndMove);
	        this.element.addEventListener("touchend", handleTouchEnd);
	      }
	    },
	    setRange: {
	
	      /**
	      Define the pitch range (lowest and highest note) of the piano keyboard.
	      @param low {number} MIDI note value of the lowest note on the keyboard
	      @param high {number} MIDI note value of the highest note on the keyboard
	      */
	
	      value: function setRange(low, high) {
	        this.range.low = low;
	        this.range.high = high;
	        this.empty();
	        this.buildInterface();
	      }
	    },
	    toggleKey: {
	
	      /**
	      Turn a key on or off using its MIDI note value;
	      @param note {number} MIDI note value of the key to change
	      @param on {boolean} Whether the note should turn on or off
	      */
	
	      value: function toggleKey(note, on) {
	        this.keys[note - this.range.low].flip(on);
	      }
	    },
	    toggleIndex: {
	
	      /**
	      Turn a key on or off using its key index on the piano interface.
	      @param index {number} Index of the key to change
	      @param on {boolean} Whether the note should turn on or off
	      */
	
	      value: function toggleIndex(index, on) {
	        this.keys[index].flip(on);
	      }
	    }
	  });
	
	  return Piano;
	})(Interface);
	
	module.exports = Piano;
	
	// loop through and render the keys?

/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var dom = __webpack_require__(7);
	var Interface = __webpack_require__(6);
	var ButtonTemplate = __webpack_require__(17);
	var MatrixModel = __webpack_require__(25);
	var CounterModel = __webpack_require__(28);
	var Interval = __webpack_require__(29);
	var touch = __webpack_require__(9);
	
	var MatrixCell = (function (_ButtonTemplate) {
	  function MatrixCell() {
	    _classCallCheck(this, MatrixCell);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [80, 80],
	      target: false,
	      mode: "toggle",
	      value: 0,
	      paddingRow: 2,
	      paddingColumn: 2
	    };
	
	    _get(Object.getPrototypeOf(MatrixCell.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.index = this.settings.index;
	    this.row = this.settings.row;
	    this.column = this.settings.column;
	
	    this.matrix = this.settings.matrix;
	
	    /**
	     *  Amount of row padding
	     *  @type {number}
	     */
	    this.paddingRow = this.settings.paddingRow || defaults.paddingRow;
	
	    /**
	     *  Amount of column padding
	     *  @type {number}
	     */
	    this.paddingColumn = this.settings.paddingColumn || defaults.paddingColumn;
	
	    this.interacting = false;
	    this.paintbrush = false;
	
	    this.init();
	    this.render();
	  }
	
	  _inherits(MatrixCell, _ButtonTemplate);
	
	  _createClass(MatrixCell, {
	    buildFrame: {
	      value: function buildFrame() {
	        this.element = svg.create("svg");
	        this.element.setAttribute("width", this.width);
	        this.element.setAttribute("height", this.height);
	        this.element.style.top = "0px";
	        this.element.style.left = "0px";
	        this.element.style.position = "absolute";
	        this.parent.appendChild(this.element);
	      }
	    },
	    buildInterface: {
	      value: function buildInterface() {
	        var _this = this;
	
	        this.pad = svg.create("rect");
	        this.element.appendChild(this.pad);
	
	        this.interactionTarget = this.pad;
	
	        /* events */
	
	        if (!touch.exists) {
	          this.click = function () {
	            _this.matrix.interacting = true;
	            _this.matrix.paintbrush = !_this.state;
	            _this.down(_this.matrix.paintbrush);
	          };
	          this.pad.addEventListener("mouseover", function () {
	            if (_this.matrix.interacting) {
	              _this.down(_this.matrix.paintbrush);
	            }
	          });
	
	          this.move = function () {};
	          this.pad.addEventListener("mousemove", function (e) {
	            if (_this.matrix.interacting) {
	              if (!_this.offset) {
	                _this.offset = dom.findPosition(_this.element);
	              }
	              _this.mouse = dom.locateMouse(e, _this.offset);
	              _this.bend();
	            }
	          });
	
	          this.release = function () {
	            _this.matrix.interacting = false;
	          };
	          this.pad.addEventListener("mouseup", function () {
	            if (_this.matrix.interacting) {
	              _this.up();
	            }
	          });
	          this.pad.addEventListener("mouseout", function () {
	            if (_this.matrix.interacting) {
	              _this.up();
	            }
	          });
	        }
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	        this.pad.setAttribute("x", this.paddingColumn / 2);
	        this.pad.setAttribute("y", this.paddingRow / 2);
	        if (this.width > 2) {
	          this.pad.setAttribute("width", this.width - this.paddingColumn);
	        } else {
	          this.pad.setAttribute("width", this.width);
	        }
	        if (this.height > 2) {
	          this.pad.setAttribute("height", this.height - this.paddingRow);
	        } else {
	          this.pad.setAttribute("height", this.height);
	        }
	        this.pad.setAttribute("fill", this.matrix.colors.fill);
	      }
	    },
	    render: {
	      value: function render() {
	        if (!this.state) {
	          this.pad.setAttribute("fill", this.matrix.colors.fill);
	        } else {
	          this.pad.setAttribute("fill", this.matrix.colors.accent);
	        }
	      }
	    }
	  });
	
	  return MatrixCell;
	})(ButtonTemplate);
	
	/**
	 * Sequencer
	 *
	 * @description Grid of buttons with built-in step sequencer.
	 *
	 * @demo <div nexus-ui="sequencer" style="width:400px;height:200px;"></div>
	 *
	 * @example
	 * var sequencer = new Nexus.Sequencer('#target')
	 *
	 * @example
	 * var sequencer = new Nexus.Sequencer('#target',{
	 *  'size': [400,200],
	 *  'mode': 'toggle',
	 *  'rows': 5,
	 *  'columns': 10,
	 *  'paddingRow': 10,
	 *  'paddingColumn': 20
	 *})
	 *
	 * @output
	 * change
	 * Fires any time the interface's matrix changes. <br>
	 * The event data is an object containing <i>row</i> (number), <i>column</i> (number), and <i>state</i> (boolean) properties.
	 *
	 * @outputexample
	 * sequencer.on('change',function(v) {
	 *   console.log(v);
	 * })
	 *
	 * @output
	 * step
	 * Fires any time the sequencer steps to the next column, in sequece mode. <br>
	 * The event data is an <i>array</i> containing all values in the column, <i>bottom row first</i>.
	 *
	 * @outputexample
	 * sequencer.on('step',function(v) {
	 *   console.log(v);
	 * })
	 */
	
	var Sequencer = (function (_Interface) {
	  function Sequencer() {
	    _classCallCheck(this, Sequencer);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [400, 200],
	      mode: "toggle",
	      rows: 5,
	      columns: 10
	    };
	
	    _get(Object.getPrototypeOf(Sequencer.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.active = -1;
	
	    /**
	     * Button interaction mode: see Button
	     * @type {string}
	     * @example button.mode = 'toggle';
	     */
	    this.mode = this.settings.mode;
	
	    /**
	     * The interval object which controls timing and sequence scheduling.
	     * @type {interval}
	     */
	    this.interval = new Interval(200, function () {}, false); // jshint ignore:line
	
	    /**
	     * A Matrix model containing methods for manipulating the sequencer's array of values. To learn how to manipulate the matrix, read about the matrix model.
	     * @type {matrix}
	     */
	    this.matrix = new MatrixModel(this.settings.rows, this.settings.columns);
	    this.matrix.ui = this;
	
	    /**
	     * A Counter model which the sequencer steps through. For example, you could use this model to step through the sequencer in reverse, randomly, or in a drunk walk.
	     * @type {counter}
	     */
	    this.stepper = new CounterModel(0, this.columns);
	
	    this.paddingRow = this.settings.paddingRow;
	    this.paddingColumn = this.settings.paddingColumn;
	
	    this.init();
	  }
	
	  _inherits(Sequencer, _Interface);
	
	  _createClass(Sequencer, {
	    buildFrame: {
	      value: function buildFrame() {
	        this.element = document.createElement("div");
	        this.element.style.position = "relative";
	        this.element.style.display = "block";
	        this.element.style.width = "100%";
	        this.element.style.height = "100%";
	        this.parent.appendChild(this.element);
	        if (touch.exists) {
	          this.addTouchListeners();
	        }
	      }
	    },
	    buildInterface: {
	      value: function buildInterface() {
	        this.cells = [];
	        for (var i = 0; i < this.matrix.length; i++) {
	          var _location = this.matrix.locate(i);
	          // returns {row,col}
	
	          var container = document.createElement("span");
	          container.style.position = "absolute";
	
	          var cell = new MatrixCell(container, {
	            component: true,
	            index: i,
	            row: _location.row,
	            column: _location.column,
	            mode: this.mode,
	            matrix: this,
	            paddingRow: this.paddingRow,
	            paddingColumn: this.paddingColumn
	          }, this.keyChange.bind(this, i));
	
	          //  cell.matrix = this;
	          if (touch.exists) {
	            cell.pad.index = i;
	            cell.preClick = cell.preMove = cell.preRelease = function () {};
	            cell.click = cell.move = cell.release = function () {};
	            cell.preTouch = cell.preTouchMove = cell.preTouchRelease = function () {};
	            cell.touch = cell.touchMove = cell.touchRelease = function () {};
	          }
	
	          this.cells.push(cell);
	          this.element.appendChild(container);
	        }
	        this.sizeInterface();
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	        var cellWidth = this.width / this.columns;
	        var cellHeight = this.height / this.rows;
	
	        for (var i = 0; i < this.cells.length; i++) {
	          var container = this.cells[i].parent;
	          container.style.left = this.cells[i].column * cellWidth + "px";
	          container.style.top = this.cells[i].row * cellHeight + "px";
	          this.cells[i].resize(cellWidth, cellHeight);
	        }
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        for (var i = 0; i < this.cells.length; i++) {
	          this.cells[i].render();
	        }
	      }
	    },
	    update: {
	      value: function update() {
	        var _this = this;
	
	        //  console.log("updating...")
	        //on = on || false;
	        this.matrix.iterate(function (r, c, i) {
	          //  console.log(this.matrix.pattern[r][c], this.cells[i].state);
	          if (_this.matrix.pattern[r][c] !== _this.cells[i].state) {
	            if (_this.matrix.pattern[r][c] > 0) {
	              _this.cells[i].turnOn();
	            } else {
	              _this.cells[i].turnOff();
	            }
	          }
	        });
	      }
	    },
	    keyChange: {
	
	      // update => cell.turnOn => cell.emit => keyChange (seq.emit) => matrix.set.cell => update
	      //
	      // interaction => keyChange => matrix.set.cell => update => cell.turnOn
	      //                                             => emit
	      //
	      // set.cell => update => needs to emit.
	
	      value: function keyChange(note, on) {
	        // emit data for any key turning on/off
	        // i is the note index
	        // v is whether it is on or off
	        var cell = this.matrix.locate(note);
	        //  this.matrix.set.cell(cell.column,cell.row,on);
	        this.matrix.pattern[cell.row][cell.column] = on;
	        var data = {
	          row: cell.row,
	          column: cell.column,
	          state: on
	        };
	        this.emit("change", data);
	      }
	    },
	    render: {
	      value: function render() {
	        var _this = this;
	
	        if (this.stepper.value >= 0) {
	          this.matrix.iterate(function (r, c, i) {
	            if (c === _this.stepper.value) {
	              _this.cells[i].pad.setAttribute("stroke", _this.colors.mediumLight);
	              _this.cells[i].pad.setAttribute("stroke-width", "1");
	              _this.cells[i].pad.setAttribute("stroke-opacity", "1");
	            } else {
	              _this.cells[i].pad.setAttribute("stroke", "none");
	            }
	          });
	        }
	      }
	    },
	    start: {
	
	      /**
	       * Start sequencing
	       * @param  {number} ms Beat tempo in milliseconds
	       */
	
	      value: function start(ms) {
	        this.interval.event = this.next.bind(this);
	        if (ms) {
	          this.interval.ms(ms);
	        }
	        this.interval.start();
	      }
	    },
	    stop: {
	
	      /**
	      Stop sequencing
	      */
	
	      value: function stop() {
	        this.interval.stop();
	      }
	    },
	    next: {
	
	      /**
	      Manually jump to the next column and trigger the 'change' event. The "next" column is determined by your mode of sequencing.
	      */
	
	      value: function next() {
	        this.stepper.next();
	        this.emit("step", this.matrix.column(this.stepper.value).reverse());
	        this.render();
	      }
	    },
	    addTouchListeners: {
	      value: function addTouchListeners() {
	        var _this = this;
	
	        this.preClick = this.preMove = this.preRelease = function () {};
	        this.click = this.move = this.release = function () {};
	        this.preTouch = this.preTouchMove = this.preTouchRelease = function () {};
	        this.touch = this.touchMove = this.touchRelease = function () {};
	
	        this.currentElement = false;
	
	        this.element.addEventListener("touchstart", function (e) {
	          var element = document.elementFromPoint(e.targetTouches[0].clientX, e.targetTouches[0].clientY);
	          var cell = _this.cells[element.index];
	          _this.paintbrush = !cell.state;
	          cell.down(_this.paintbrush);
	          _this.currentElement = element.index;
	          e.preventDefault();
	          e.stopPropagation();
	        });
	
	        this.element.addEventListener("touchmove", function (e) {
	          var element = document.elementFromPoint(e.targetTouches[0].clientX, e.targetTouches[0].clientY);
	          var cell = _this.cells[element.index];
	          if (element.index !== _this.currentElement) {
	            if (_this.currentElement >= 0) {
	              var pastCell = _this.cells[_this.currentElement];
	              pastCell.up();
	            }
	            cell.down(_this.paintbrush);
	          } else {
	            cell.bend();
	          }
	          _this.currentElement = element.index;
	          e.preventDefault();
	          e.stopPropagation();
	        });
	
	        this.element.addEventListener("touchend", function (e) {
	          // no touches to calculate because none remaining
	          var cell = _this.cells[_this.currentElement];
	          cell.up();
	          _this.interacting = false;
	          _this.currentElement = false;
	          e.preventDefault();
	          e.stopPropagation();
	        });
	      }
	    },
	    rows: {
	
	      /**
	      Number of rows in the sequencer
	      @type {number}
	      */
	
	      get: function () {
	        return this.matrix.rows;
	      },
	      set: function (v) {
	        this.matrix.rows = v;
	        this.empty();
	        this.buildInterface();
	        this.update();
	      }
	    },
	    columns: {
	
	      /**
	      Number of columns in the sequencer
	      @type {number}
	      */
	
	      get: function () {
	        return this.matrix.columns;
	      },
	      set: function (v) {
	        this.matrix.columns = v;
	        this.stepper.max = v;
	        this.empty();
	        this.buildInterface();
	        this.update();
	      }
	    }
	  });
	
	  return Sequencer;
	})(Interface);
	
	module.exports = Sequencer;

/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var math = _interopRequire(__webpack_require__(5));
	
	var Sequence = _interopRequire(__webpack_require__(26));
	
	// For the tutorial, looking at
	
	//Pattern section:
	// .create(), .rows, .columns,
	// .pattern, .length, .formatAsText(), .log(),
	// .locate(i), .indexOf(c,r)
	// row(), column() (returns contents of row or colum)
	
	//Control section:
	// toggle x3
	// set x4
	// rotate x3
	// populate x3
	// erase x3
	
	// should some version of this have a float value for each cell?
	// could be like a mirror .pattern that has values. by default, everything is 1, but could be set...
	// not a good way to do that on interface, but as a model it would be nice...
	// for .formatAsText(), could multiply by 100 and floor, so each cell is an int from 0 to 9
	
	var Matrix = (function () {
	  function Matrix(rows, columns) {
	    var _this = this;
	
	    _classCallCheck(this, Matrix);
	
	    // should also have ability to create using an existing matrix (2d array)
	    this.pattern = [];
	    this.create(rows, columns);
	
	    this.toggle = {
	      cell: function (column, row) {
	        _this.pattern[row][column] = !_this.pattern[row][column]; // math.invert(this.pattern[row][column]);
	        if (_this.ui) {
	          _this.ui.update();
	        }
	        return _this.pattern[row][column];
	      },
	      all: function () {
	        _this.iterate(function (r, c) {
	          _this.toggle.cell(c, r);
	        });
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      },
	      row: function (row) {
	        for (var i = 0; i < _this.columns; i++) {
	          _this.toggle.cell(i, row);
	        }
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      },
	      column: function (column) {
	        for (var i = 0; i < _this.rows; i++) {
	          _this.toggle.cell(column, i);
	        }
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      }
	    };
	
	    this.set = {
	      cell: function (column, row, value) {
	        _this.pattern[row][column] = value;
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      },
	      all: function (values) {
	        // set the whole matrix using a 2d array as input
	        // this should also resize the array?
	        _this.pattern = values;
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      },
	      row: function (row, values) {
	        // set a row using an array as input
	        _this.pattern[row] = values;
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      },
	      column: function (column, values) {
	        // set a column using an array as input
	        _this.pattern.forEach(function (row, i) {
	          _this.pattern[i][column] = values[i];
	        });
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      }
	    };
	
	    this.rotate = {
	      //should eventually do (amountX, amountY) here
	      // could just use a loop and this.rotate.row(i,amountX);
	      all: function (amount) {
	        if (!amount && amount !== 0) {
	          amount = 1;
	        }
	        amount %= _this.pattern[0].length;
	        if (amount < 0) {
	          amount = _this.pattern[0].length + amount;
	        }
	        for (var i = 0; i < _this.rows; i++) {
	          var cut = _this.pattern[i].splice(_this.pattern[i].length - amount, amount);
	          _this.pattern[i] = cut.concat(_this.pattern[i]);
	        }
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      },
	      row: function (row, amount) {
	        if (!amount && amount !== 0) {
	          amount = 1;
	        }
	        amount %= _this.pattern[0].length;
	        if (amount < 0) {
	          amount = _this.pattern[0].length + amount;
	        }
	        var cut = _this.pattern[row].splice(_this.pattern[row].length - amount, amount);
	        _this.pattern[row] = cut.concat(_this.pattern[row]);
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      },
	      column: function (column, amount) {
	        if (!amount && amount !== 0) {
	          amount = 1;
	        }
	        amount %= _this.pattern.length;
	        if (amount < 0) {
	          amount = _this.pattern.length + amount;
	        }
	        var proxy = [];
	        _this.pattern.forEach(function (row) {
	          proxy.push(row[column]);
	        });
	        var cut = proxy.splice(proxy.length - amount, amount);
	        proxy = cut.concat(proxy);
	        _this.pattern.forEach(function (row, i) {
	          row[column] = proxy[i];
	        });
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      }
	    };
	
	    // the idea behind populate is to be able to set a whole row or column to 0 or 1
	    // IF the value is a float, such as 0.7, then it would become a probability
	    // so populate(0.7) would give each cell a 70% chance of being 1
	    this.populate = {
	      all: function (odds) {
	        var oddsSequence = new Sequence(odds);
	        _this.iterate(function (r, c) {
	          _this.pattern[r][c] = math.coin(oddsSequence.next());
	        });
	        // This could be used so that each row has same odds pattern, even if row length is not divisibly by sequence length.
	        //,() => {
	        //  odds.pos = -1;
	        // }
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      },
	      row: function () {
	        var row = arguments[0] === undefined ? 0 : arguments[0];
	        var odds = arguments[1] === undefined ? 1 : arguments[1];
	
	        var oddsSequence = new Sequence(odds);
	        _this.pattern[row].forEach(function (cell, i) {
	          _this.pattern[row][i] = math.coin(oddsSequence.next());
	        });
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      },
	      column: function () {
	        var column = arguments[0] === undefined ? 0 : arguments[0];
	        var odds = arguments[1] === undefined ? 1 : arguments[1];
	
	        var oddsSequence = new Sequence(odds);
	        _this.pattern.forEach(function (row, i) {
	          _this.pattern[i][column] = math.coin(oddsSequence.next());
	        });
	        if (_this.ui) {
	          _this.ui.update();
	        }
	      }
	    };
	
	    // essentiall populate(0) so i'm not sure if this is necessary but is nice
	    this.erase = {
	      all: function () {
	        _this.set.all(0);
	      },
	      row: function (row) {
	        _this.set.row(row, 0);
	      },
	      column: function (column) {
	        _this.set.column(column, 0);
	      }
	    };
	
	    // end constructor
	  }
	
	  _createClass(Matrix, {
	    create: {
	      value: function create(rows, columns) {
	        var _this = this;
	
	        this.pattern = [];
	        for (var row = 0; row < rows; row++) {
	          var arr = new Array(columns);
	          this.pattern.push(arr);
	        }
	        this.iterate(function (r, c) {
	          _this.pattern[r][c] = false;
	        });
	      }
	    },
	    iterate: {
	      value: function iterate(f, f2) {
	        var i = 0;
	        for (var row = 0; row < this.rows; row++) {
	          if (f2) {
	            f2(row);
	          }
	          for (var column = 0; column < this.columns; column++) {
	            f(row, column, i);
	            i++;
	          }
	        }
	      }
	    },
	    formatAsText: {
	      value: function formatAsText() {
	        var _this = this;
	
	        var patternString = "";
	        this.iterate(function (r, c) {
	          patternString += (_this.pattern[r][c] ? 1 : 0) + " ";
	        }, function () {
	          patternString += "\n";
	        });
	        return patternString;
	      }
	    },
	    log: {
	      value: function log() {
	        console.log(this.formatAsText());
	      }
	    },
	    update: {
	      value: function update(pattern) {
	        this.pattern = pattern || this.pattern;
	      }
	    },
	    length: {
	      get: function () {
	        return this.rows * this.columns;
	      }
	    },
	    locate: {
	      value: function locate(index) {
	        // returns row and column of cell by index
	        return {
	          row: ~ ~(index / this.columns),
	          column: index % this.columns
	        };
	      }
	    },
	    indexOf: {
	      value: function indexOf(row, column) {
	        return column + row * this.columns;
	        // returns index of cell by row and column
	      }
	    },
	    row: {
	      value: (function (_row) {
	        var _rowWrapper = function row(_x) {
	          return _row.apply(this, arguments);
	        };
	
	        _rowWrapper.toString = function () {
	          return _row.toString();
	        };
	
	        return _rowWrapper;
	      })(function (row) {
	        var data = [];
	        for (var i = 0; i < this.columns; i++) {
	          data.push(this.pattern[row] ? 1 : 0);
	        }
	        return data;
	      })
	    },
	    column: {
	      value: (function (_column) {
	        var _columnWrapper = function column(_x2) {
	          return _column.apply(this, arguments);
	        };
	
	        _columnWrapper.toString = function () {
	          return _column.toString();
	        };
	
	        return _columnWrapper;
	      })(function (column) {
	        var data = [];
	        for (var i = 0; i < this.rows; i++) {
	          data.push(this.pattern[i][column] ? 1 : 0);
	        }
	        return data;
	      })
	    },
	    rows: {
	      get: function () {
	        return this.pattern.length;
	      },
	      set: function (v) {
	        var _this = this;
	
	        var previous = this.pattern.slice(0);
	        this.create(v, this.columns);
	        this.iterate(function (r, c) {
	          if (previous[r] && previous[r][c]) {
	            _this.pattern[r][c] = previous[r][c];
	          }
	        });
	      }
	    },
	    columns: {
	      get: function () {
	        return this.pattern[0].length;
	      },
	      set: function (v) {
	        var _this = this;
	
	        var previous = this.pattern.slice(0);
	        this.create(this.rows, v);
	        this.iterate(function (r, c) {
	          if (previous[r] && previous[r][c]) {
	            _this.pattern[r][c] = previous[r][c];
	          }
	        });
	      }
	    }
	  });
	
	  return Matrix;
	})();
	
	module.exports = Matrix;

/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var math = _interopRequire(__webpack_require__(5));
	
	var Drunk = _interopRequire(__webpack_require__(27));
	
	var Sequence = (function () {
	  function Sequence() {
	    var sequence = arguments[0] === undefined ? [0, 10, 20, 30] : arguments[0];
	    var mode = arguments[1] === undefined ? "up" : arguments[1];
	    var position = arguments[2] === undefined ? false : arguments[2];
	
	    _classCallCheck(this, Sequence);
	
	    this.values = sequence;
	    if (!Array.isArray(this.values)) {
	      this.values = [this.values];
	    }
	    this._mode = mode;
	    this.position = position;
	
	    this.drunkWalk = new Drunk(0, this.values.length - 1);
	
	    this.startValues = {
	      up: 0,
	      down: this.values.length - 1,
	      drunk: ~ ~(this.values.length / 2),
	      random: math.ri(this.values.length)
	    };
	
	    if (this.position !== false) {
	      this.next = this[this._mode];
	    } else {
	      this.next = this.first;
	    }
	  }
	
	  _createClass(Sequence, {
	    mode: {
	      get: function () {
	        return this._mode;
	      },
	      set: function (mode) {
	        if (!(mode === "up" || mode === "down" || mode === "random" || mode === "drunk")) {
	          console.error("The only modes currently allowed are: up, down, random, drunk");
	          return;
	        }
	        this._mode = mode;
	        if (this.position) {
	          this.next = this[this._mode];
	        }
	      }
	    },
	    value: {
	      get: function () {
	        return this.values[this.position];
	      },
	      set: function (v) {
	        this.position = this.values.indexOf(v);
	      }
	    },
	    first: {
	      value: function first() {
	        if (this.position !== false) {
	          this.next = this[this._mode];
	          return this.next();
	        }
	        this.position = this.startValues[this._mode];
	        this.next = this[this._mode];
	        return this.value;
	      }
	    },
	    up: {
	      value: function up() {
	        this.position++;
	        this.position %= this.values.length;
	        return this.value;
	      }
	    },
	    down: {
	      value: function down() {
	        this.position--;
	        if (this.position < 0) {
	          this.position = (this.position + this.values.length) % this.values.length;
	        }
	        return this.value;
	      }
	    },
	    random: {
	      value: function random() {
	        this.position = math.ri(0, this.values.length);
	        return this.value;
	      }
	    },
	    drunk: {
	      value: function drunk() {
	        this.drunkWalk.max = this.values.length;
	        this.drunkWalk.value = this.position;
	        this.position = this.drunkWalk.next();
	        return this.value;
	      }
	
	      /* future methods
	      .group(start,stop) -- outputs a group of n items from the list, with wrapping
	      .loop(start,stop) -- confines sequencing to a subset of the values
	          (could even have a distinction between .originalValues and the array of values being used)
	      */
	
	    }
	  });
	
	  return Sequence;
	})();
	
	module.exports = Sequence;

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var math = _interopRequire(__webpack_require__(5));
	
	var Drunk = (function () {
	    function Drunk() {
	        var min = arguments[0] === undefined ? 0 : arguments[0];
	        var max = arguments[1] === undefined ? 9 : arguments[1];
	        var value = arguments[2] === undefined ? 0 : arguments[2];
	        var increment = arguments[3] === undefined ? 1 : arguments[3];
	        var loop = arguments[4] === undefined ? false : arguments[4];
	
	        _classCallCheck(this, Drunk);
	
	        this.min = min;
	        this.max = max;
	        this.value = value;
	        this.increment = increment;
	        this.loop = loop;
	    }
	
	    _createClass(Drunk, {
	        next: {
	            value: function next() {
	                this.value += math.pick(-1 * this.increment, this.increment);
	                if (this.value > this.max) {
	                    if (this.loop) {
	                        this.value = this.min;
	                    } else {
	                        this.value = this.max - this.increment;
	                    }
	                }
	
	                if (this.value < this.min) {
	                    if (this.loop) {
	                        this.value = this.max;
	                    } else {
	                        this.value = this.min + this.increment;
	                    }
	                }
	                return this.value;
	            }
	        }
	    });
	
	    return Drunk;
	})();
	
	module.exports = Drunk;

/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var math = _interopRequire(__webpack_require__(5));
	
	var Drunk = _interopRequire(__webpack_require__(27));
	
	var Counter = (function () {
	    function Counter() {
	        var min = arguments[0] === undefined ? 0 : arguments[0];
	        var max = arguments[1] === undefined ? 10 : arguments[1];
	        var mode = arguments[2] === undefined ? "up" : arguments[2];
	        var value = arguments[3] === undefined ? false : arguments[3];
	
	        _classCallCheck(this, Counter);
	
	        this.min = min;
	        this.max = max;
	        this.value = value;
	        this.mode = mode;
	        this.drunkWalk = new Drunk(this.min, this.max);
	        if (this.value !== false) {
	            this.next = this[this._mode];
	        } else {
	            this.next = this.first;
	        }
	    }
	
	    _createClass(Counter, {
	        mode: {
	            set: function (mode) {
	                if (!(mode === "up" || mode === "down" || mode === "random" || mode === "drunk")) {
	                    console.error("The only modes currently allowed are: up, down, random, drunk");
	                    return;
	                }
	                this._mode = mode;
	                if (this.value) {
	                    this.next = this[this._mode];
	                }
	            },
	            get: function () {
	                return this._mode;
	            }
	        },
	        first: {
	            value: function first() {
	                if (this.value !== false) {
	                    this.next = this[this._mode];
	                    return this.next();
	                }
	                this.startValues = {
	                    up: this.min,
	                    down: this.max,
	                    drunk: ~ ~math.average(this.min, this.max),
	                    random: math.ri(this.min, this.max)
	                };
	                this.value = this.startValues[this._mode];
	                this.next = this[this._mode];
	                return this.value;
	            }
	        },
	        up: {
	            value: function up() {
	                this.value++;
	                if (this.value >= this.max) {
	                    this.value = this.min;
	                }
	                return this.value;
	            }
	        },
	        down: {
	            value: function down() {
	                this.value--;
	                if (this.value < this.min) {
	                    this.value = this.max;
	                }
	                return this.value;
	            }
	        },
	        random: {
	            value: function random() {
	                this.value = math.ri(this.min, this.max);
	                return this.value;
	            }
	        },
	        drunk: {
	            value: function drunk() {
	                this.drunkWalk.min = this.min;
	                this.drunkWalk.max = this.max;
	                this.drunkWalk.value = this.value;
	                this.value = this.drunkWalk.next();
	                return this.value;
	            }
	        }
	    });
	
	    return Counter;
	})();
	
	module.exports = Counter;

/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var clock = __webpack_require__(1).clock;
	
	var Interval = (function () {
	  function Interval(rate, func, on) {
	    _classCallCheck(this, Interval);
	
	    this.rate = rate;
	    this.on = on;
	    this.clock = clock(); // jshint ignore:line
	
	    this.pattern = [1];
	    this.index = 0;
	
	    this.event = func ? func : function () {};
	
	    if (this.on) {
	      this.start();
	    }
	  }
	
	  _createClass(Interval, {
	    _event: {
	      value: function _event(e) {
	        //  if (this.pattern[this.index%this.pattern.length]) {
	        this.event(e);
	        //  }
	        this.index++;
	      }
	    },
	    stop: {
	      value: function stop() {
	        this.on = false;
	        this.interval.clear();
	      }
	    },
	    start: {
	      value: function start() {
	        this.on = true;
	        this.interval = this.clock.callbackAtTime(this._event.bind(this), this.clock.context.currentTime).repeat(this.rate / 1000).tolerance({ early: 0.1, late: 1 });
	      }
	    },
	    ms: {
	      value: function ms(newrate) {
	        if (this.on) {
	          var ratio = newrate / this.rate;
	          this.rate = newrate;
	          this.clock.timeStretch(this.clock.context.currentTime, [this.interval], ratio);
	        } else {
	          this.rate = newrate;
	        }
	      }
	    }
	  });
	
	  return Interval;
	})();
	
	module.exports = Interval;

/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequireWildcard = function (obj) { return obj && obj.__esModule ? obj : { "default": obj }; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var math = __webpack_require__(5);
	var Interface = __webpack_require__(6);
	var Step = __webpack_require__(11);
	
	var Interaction = _interopRequireWildcard(__webpack_require__(12));
	
	/**
	* Pan2D
	*
	* @description Interface for moving a sound around an array of speakers. Speaker locations can be customized. The interface calculates the closeness of the sound source to each speaker and returns that distance as a numeric value.
	*
	* @demo <span nexus-ui="pan2D"></span>
	*
	* @example
	* var pan2d = new Nexus.Pan2d('#target')
	*
	* @example
	* var pan2d = new Nexus.Pan2D('#target',{
	*   'size': [200,200],
	*   'range': 0.5,  // detection radius of each speaker
	*   'mode': 'absolute',   // 'absolute' or 'relative' sound movement
	*   'speakers': [  // the speaker [x,y] positions
	*       [0.5,0.2],
	*       [0.75,0.25],
	*       [0.8,0.5],
	*       [0.75,0.75],
	*       [0.5,0.8],
	*       [0.25,0.75]
	*       [0.2,0.5],
	*       [0.25,0.25]
	*   ]
	* })
	*
	* @output
	* change
	* Fires any time the "source" node's position changes. <br>
	* The event data is an array of the amplitudes (0-1), representing the level of each speaker (as calculated by its distance to the audio source).
	*
	* @outputexample
	* pan2d.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*/
	
	var Pan2D = (function (_Interface) {
	  function Pan2D() {
	    _classCallCheck(this, Pan2D);
	
	    var options = ["range"];
	
	    var defaults = {
	      size: [200, 200],
	      range: 0.5,
	      mode: "absolute",
	      speakers: [[0.5, 0.2], [0.75, 0.25], [0.8, 0.5], [0.75, 0.75], [0.5, 0.8], [0.25, 0.75], [0.2, 0.5], [0.25, 0.25]]
	    };
	
	    _get(Object.getPrototypeOf(Pan2D.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.value = {
	      x: new Step(0, 1, 0, 0.5),
	      y: new Step(0, 1, 0, 0.5)
	    };
	
	    /**
	    Absolute or relative mouse interaction. In "absolute" mode, the source node will jump to your mouse position on mouse click. In "relative" mode, it does not.
	    */
	    this.mode = this.settings.mode;
	
	    this.position = {
	      x: new Interaction.Handle(this.mode, "horizontal", [0, this.width], [this.height, 0]),
	      y: new Interaction.Handle(this.mode, "vertical", [0, this.width], [this.height, 0])
	    };
	    this.position.x.value = this.value.x.normalized;
	    this.position.y.value = this.value.y.normalized;
	
	    /**
	    An array of speaker locations. Update this with .moveSpeaker() or .moveAllSpeakers()
	    */
	    this.speakers = this.settings.speakers;
	
	    /**
	    Rewrite: The maximum distance from a speaker that the source node can be for it to be heard from that speaker. A low range (0.1) will result in speakers only playing when the sound is very close it. Default is 0.5 (half of the interface).
	    */
	    this.range = this.settings.range;
	
	    /**
	    The current levels for each speaker. This is calculated when a source node or speaker node is moved through interaction or programatically.
	    */
	    this.levels = [];
	
	    this.init();
	
	    this.calculateLevels();
	    this.render();
	  }
	
	  _inherits(Pan2D, _Interface);
	
	  _createClass(Pan2D, {
	    buildInterface: {
	      value: function buildInterface() {
	
	        this.knob = svg.create("circle");
	
	        this.element.appendChild(this.knob);
	
	        // add speakers
	        this.speakerElements = [];
	
	        for (var i = 0; i < this.speakers.length; i++) {
	          var speakerElement = svg.create("circle");
	
	          this.element.appendChild(speakerElement);
	
	          this.speakerElements.push(speakerElement);
	        }
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        this._minDimension = Math.min(this.width, this.height);
	
	        this.knobRadius = {
	          off: ~ ~(this._minDimension / 100) * 3 + 5 };
	        this.knobRadius.on = this.knobRadius.off * 2;
	
	        this.knob.setAttribute("cx", this.width / 2);
	        this.knob.setAttribute("cy", this.height / 2);
	        this.knob.setAttribute("r", this.knobRadius.off);
	
	        for (var i = 0; i < this.speakers.length; i++) {
	          var speakerElement = this.speakerElements[i];
	          var speaker = this.speakers[i];
	          speakerElement.setAttribute("cx", speaker[0] * this.width);
	          speakerElement.setAttribute("cy", speaker[1] * this.height);
	          speakerElement.setAttribute("r", this._minDimension / 20 + 5);
	          speakerElement.setAttribute("fill-opacity", "0");
	        }
	
	        this.position.x.resize([0, this.width], [this.height, 0]);
	        this.position.y.resize([0, this.width], [this.height, 0]);
	
	        // next, need to
	        // resize positions
	        // calculate speaker distances
	        this.calculateLevels();
	        this.render();
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	
	        this.element.style.backgroundColor = this.colors.fill;
	        this.knob.setAttribute("fill", this.colors.mediumLight);
	
	        for (var i = 0; i < this.speakers.length; i++) {
	          var speakerElement = this.speakerElements[i];
	          speakerElement.setAttribute("fill", this.colors.accent);
	          speakerElement.setAttribute("stroke", this.colors.accent);
	        }
	      }
	    },
	    render: {
	      value: function render() {
	        this.knobCoordinates = {
	          x: this.value.x.normalized * this.width,
	          y: this.height - this.value.y.normalized * this.height
	        };
	
	        this.knob.setAttribute("cx", this.knobCoordinates.x);
	        this.knob.setAttribute("cy", this.knobCoordinates.y);
	      }
	    },
	    click: {
	      value: function click() {
	        this.position.x.anchor = this.mouse;
	        this.position.y.anchor = this.mouse;
	        this.move();
	      }
	    },
	    move: {
	      value: function move() {
	        if (this.clicked) {
	          this.position.x.update(this.mouse);
	          this.position.y.update(this.mouse);
	          // position.x and position.y are normalized
	          // so are the levels
	          // likely don't need this.value at all -- only used for drawing
	          // not going to be a 'step' or 'min' and 'max' in this one.
	          this.calculateLevels();
	          this.emit("change", this.levels);
	          this.render();
	        }
	      }
	    },
	    release: {
	      value: function release() {
	        this.render();
	      }
	    },
	    normalized: {
	      get: function () {
	        return {
	          x: this.value.x.normalized,
	          y: this.value.y.normalized
	        };
	      }
	    },
	    calculateLevels: {
	      value: function calculateLevels() {
	        var _this = this;
	
	        this.value.x.updateNormal(this.position.x.value);
	        this.value.y.updateNormal(this.position.y.value);
	        this.levels = [];
	        this.speakers.forEach(function (s, i) {
	          var distance = math.distance(s[0] * _this.width, s[1] * _this.height, _this.position.x.value * _this.width, (1 - _this.position.y.value) * _this.height);
	          var level = math.clip(1 - distance / (_this.range * _this.width), 0, 1);
	          _this.levels.push(level);
	          _this.speakerElements[i].setAttribute("fill-opacity", level);
	        });
	      }
	    },
	    moveSource: {
	
	      /**
	      Move the audio source node and trigger the output event.
	      @param x {number} New x location, normalized 0-1
	      @param y {number} New y location, normalized 0-1
	      */
	
	      value: function moveSource(x, y) {
	        var location = {
	          x: x * this.width,
	          y: y * this.height
	        };
	        this.position.x.update(location);
	        this.position.y.update(location);
	        this.calculateLevels();
	        this.emit("change", this.levels);
	        this.render();
	      }
	    },
	    moveSpeaker: {
	
	      /**
	      Move a speaker node and trigger the output event.
	      @param index {number} Index of the speaker to move
	      @param x {number} New x location, normalized 0-1
	      @param y {number} New y location, normalized 0-1
	      */
	
	      value: function moveSpeaker(index, x, y) {
	
	        this.speakers[index] = [x, y];
	        this.speakerElements[index].setAttribute("cx", x * this.width);
	        this.speakerElements[index].setAttribute("cy", y * this.height);
	        this.calculateLevels();
	        this.emit("change", this.levels);
	        this.render();
	      }
	
	      /**
	      Set all speaker locations
	      @param locations {Array} Array of speaker locations. Each item in the array should be an array of normalized x and y coordinates.
	       setSpeakers(locations) {
	       }
	      */
	
	    }
	  });
	
	  return Pan2D;
	})(Interface);
	
	module.exports = Pan2D;

/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var math = __webpack_require__(5);
	var svg = __webpack_require__(4);
	var Interface = __webpack_require__(6);
	
	/**
	* Tilt
	*
	* @description Device tilt sensor with 2 or 3 axes (depending on your device and browser).
	*
	* @demo <span nexus-ui='tilt'></span>
	*
	* @example
	* var tilt = new Nexus.Tilt('#target')
	*
	* @output
	* change
	* Fires at a regular interval, as long as this interface is active (see the interface's <i>.active</i> property)<br>
	* The event data is an <i>object</i> containing x (number) and y (number) properties which represent the current tilt state of the device.
	*
	* @outputexample
	* tilt.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*
	*/
	
	var Tilt = (function (_Interface) {
	  function Tilt() {
	    _classCallCheck(this, Tilt);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [80, 80]
	    };
	
	    _get(Object.getPrototypeOf(Tilt.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this._active = true;
	
	    this.init();
	
	    // add event listener for device orientation
	
	    this.boundUpdate = this.update.bind(this);
	    //	this.boundMozTilt = this.mozTilt.bind(this)
	
	    if (window.DeviceOrientationEvent) {
	      this.orientationListener = window.addEventListener("deviceorientation", this.boundUpdate, false);
	    } else {
	      this._active = false;
	      this.colorInterface();
	    }
	
	    /*else if (window.OrientationEvent) {
	    //	  	window.addEventListener('MozOrientation', this.boundMozTilt, false);
	    } else {
	    console.log('Not supported on your device or browser.');
	    } */
	  }
	
	  _inherits(Tilt, _Interface);
	
	  _createClass(Tilt, {
	    buildInterface: {
	      value: function buildInterface() {
	
	        this.title = svg.create("text");
	        this.circleX = svg.create("circle");
	        this.circleY = svg.create("circle");
	        this.circleZ = svg.create("circle");
	
	        this.barX = svg.create("path");
	        this.barY = svg.create("path");
	        this.barZ = svg.create("path");
	
	        this.barX2 = svg.create("path");
	        this.barY2 = svg.create("path");
	        this.barZ2 = svg.create("path");
	
	        this.barX.setAttribute("opacity", "0.8");
	        this.barY.setAttribute("opacity", "0.8");
	        this.barZ.setAttribute("opacity", "0.8");
	        this.barX2.setAttribute("opacity", "0.8");
	        this.barY2.setAttribute("opacity", "0.8");
	        this.barZ2.setAttribute("opacity", "0.8");
	
	        this.circleX.setAttribute("cx", this.width * 3 / 12);
	        this.circleX.setAttribute("cy", this.height * 3 / 4);
	        this.circleX.setAttribute("r", this.height / 10);
	        this.circleX.setAttribute("opacity", "0.4");
	
	        this.circleY.setAttribute("cx", this.width * 6 / 12);
	        this.circleY.setAttribute("cy", this.height * 3 / 4);
	        this.circleY.setAttribute("r", this.height / 10);
	        this.circleY.setAttribute("opacity", "0.4");
	
	        this.circleZ.setAttribute("cx", this.width * 9 / 12);
	        this.circleZ.setAttribute("cy", this.height * 3 / 4);
	        this.circleZ.setAttribute("r", this.height / 10);
	        this.circleZ.setAttribute("opacity", "0.4");
	
	        this.barX.setAttribute("stroke-width", Math.round(this.height / 30));
	        this.barY.setAttribute("stroke-width", Math.round(this.height / 30));
	        this.barZ.setAttribute("stroke-width", Math.round(this.height / 30));
	
	        this.barX.setAttribute("fill", "none");
	        this.barY.setAttribute("fill", "none");
	        this.barZ.setAttribute("fill", "none");
	
	        this.barX2.setAttribute("stroke-width", Math.round(this.height / 30));
	        this.barY2.setAttribute("stroke-width", Math.round(this.height / 30));
	        this.barZ2.setAttribute("stroke-width", Math.round(this.height / 30));
	
	        this.barX2.setAttribute("fill", "none");
	        this.barY2.setAttribute("fill", "none");
	        this.barZ2.setAttribute("fill", "none");
	
	        this.title.setAttribute("x", this.width / 2);
	        this.title.setAttribute("y", this.height / 3 + 7);
	        this.title.setAttribute("font-size", "15px");
	        this.title.setAttribute("font-weight", "bold");
	        this.title.setAttribute("letter-spacing", "2px");
	        this.title.setAttribute("opacity", "0.7");
	        this.title.setAttribute("text-anchor", "middle");
	        this.title.textContent = "TILT";
	
	        this.element.appendChild(this.circleX);
	        this.element.appendChild(this.circleY);
	        this.element.appendChild(this.circleZ);
	
	        this.element.appendChild(this.barX);
	        this.element.appendChild(this.barY);
	        this.element.appendChild(this.barZ);
	
	        this.element.appendChild(this.barX2);
	        this.element.appendChild(this.barY2);
	        this.element.appendChild(this.barZ2);
	
	        this.element.appendChild(this.title);
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	
	        if (this._active) {
	          this.element.style.backgroundColor = this.colors.accent;
	          this.circleX.setAttribute("fill", this.colors.light);
	          this.circleY.setAttribute("fill", this.colors.light);
	          this.circleZ.setAttribute("fill", this.colors.light);
	          this.circleX.setAttribute("stroke", this.colors.light);
	          this.circleY.setAttribute("stroke", this.colors.light);
	          this.circleZ.setAttribute("stroke", this.colors.light);
	          this.barX.setAttribute("stroke", this.colors.light);
	          this.barY.setAttribute("stroke", this.colors.light);
	          this.barZ.setAttribute("stroke", this.colors.light);
	          this.barX2.setAttribute("stroke", this.colors.light);
	          this.barY2.setAttribute("stroke", this.colors.light);
	          this.barZ2.setAttribute("stroke", this.colors.light);
	          this.title.setAttribute("fill", this.colors.light);
	        } else {
	          this.element.style.backgroundColor = this.colors.fill;
	          this.circleX.setAttribute("fill", this.colors.mediumLight);
	          this.circleY.setAttribute("fill", this.colors.mediumLight);
	          this.circleZ.setAttribute("fill", this.colors.mediumLight);
	          this.circleX.setAttribute("stroke", this.colors.mediumLight);
	          this.circleY.setAttribute("stroke", this.colors.mediumLight);
	          this.circleZ.setAttribute("stroke", this.colors.mediumLight);
	          this.barX.setAttribute("stroke", this.colors.mediumLight);
	          this.barY.setAttribute("stroke", this.colors.mediumLight);
	          this.barZ.setAttribute("stroke", this.colors.mediumLight);
	          this.barX2.setAttribute("stroke", this.colors.mediumLight);
	          this.barY2.setAttribute("stroke", this.colors.mediumLight);
	          this.barZ2.setAttribute("stroke", this.colors.mediumLight);
	          this.title.setAttribute("fill", this.colors.mediumLight);
	        }
	      }
	    },
	    update: {
	      value: function update(v) {
	        if (this._active) {
	
	          var y = v.beta;
	          var x = v.gamma;
	          var z = v.alpha;
	
	          // take the original -90 to 90 scale and normalize it 0-1
	          x = math.scale(x, -90, 90, 0, 1);
	          y = math.scale(y, -90, 90, 0, 1);
	          z = math.scale(z, 0, 360, 0, 1);
	
	          var handlePoints = {
	            start: Math.PI * 1.5,
	            end: math.clip(math.scale(x, 0, 0.5, Math.PI * 1.5, Math.PI * 0.5), Math.PI * 0.5, Math.PI * 1.5)
	          };
	          var handle2Points = {
	            start: Math.PI * 2.5,
	            end: math.clip(math.scale(x, 0.5, 1, Math.PI * 2.5, Math.PI * 1.5), Math.PI * 1.5, Math.PI * 2.5)
	          };
	
	          var handlePath = svg.arc(this.circleX.cx.baseVal.value, this.circleX.cy.baseVal.value, this.circleX.r.baseVal.value, handlePoints.start, handlePoints.end);
	          var handle2Path = svg.arc(this.circleX.cx.baseVal.value, this.circleX.cy.baseVal.value, this.circleX.r.baseVal.value, handle2Points.start, handle2Points.end);
	
	          this.barX.setAttribute("d", handlePath);
	          this.barX2.setAttribute("d", handle2Path);
	
	          handlePoints = {
	            start: Math.PI * 1.5,
	            end: math.clip(math.scale(y, 0, 0.5, Math.PI * 1.5, Math.PI * 0.5), Math.PI * 0.5, Math.PI * 1.5)
	          };
	          handle2Points = {
	            start: Math.PI * 2.5,
	            end: math.clip(math.scale(y, 0.5, 1, Math.PI * 2.5, Math.PI * 1.5), Math.PI * 1.5, Math.PI * 2.5)
	          };
	
	          handlePath = svg.arc(this.circleY.cx.baseVal.value, this.circleY.cy.baseVal.value, this.circleY.r.baseVal.value, handlePoints.start, handlePoints.end);
	          handle2Path = svg.arc(this.circleY.cx.baseVal.value, this.circleY.cy.baseVal.value, this.circleY.r.baseVal.value, handle2Points.start, handle2Points.end);
	
	          this.barY.setAttribute("d", handlePath);
	          this.barY2.setAttribute("d", handle2Path);
	
	          handlePoints = {
	            start: Math.PI * 1.5,
	            end: math.clip(math.scale(z, 0, 0.5, Math.PI * 1.5, Math.PI * 0.5), Math.PI * 0.5, Math.PI * 1.5)
	          };
	          handle2Points = {
	            start: Math.PI * 2.5,
	            end: math.clip(math.scale(z, 0.5, 1, Math.PI * 2.5, Math.PI * 1.5), Math.PI * 1.5, Math.PI * 2.5)
	          };
	
	          handlePath = svg.arc(this.circleZ.cx.baseVal.value, this.circleZ.cy.baseVal.value, this.circleZ.r.baseVal.value, handlePoints.start, handlePoints.end);
	          handle2Path = svg.arc(this.circleZ.cx.baseVal.value, this.circleZ.cy.baseVal.value, this.circleZ.r.baseVal.value, handle2Points.start, handle2Points.end);
	
	          this.barZ.setAttribute("d", handlePath);
	          this.barZ2.setAttribute("d", handle2Path);
	
	          /*
	           let pointsX = {
	            start: 0,
	            end: math.scale( x, 0, 1, 0, Math.PI*2 )
	          };
	          //  console.log(this.circleX.cx.baseVal.value);
	           let pathX = svg.arc(this.circleX.cx.baseVal.value, this.circleX.cy.baseVal.value, this.circleX.r.baseVal.value*2, pointsX.start, pointsX.end);
	           this.barX.setAttribute('d',pathX); */
	
	          //this.textH.textContent = math.prune(x,2);
	          //this.textV.textContent = math.prune(y,2);
	          //
	          //  this.circleX.setAttribute('opacity',x);
	          //  this.circleY.setAttribute('opacity',y);
	          //  this.circleZ.setAttribute('opacity',z);
	
	          this.emit("change", {
	            x: x,
	            y: y,
	            z: z
	          });
	        }
	      }
	    },
	    click: {
	      value: function click() {
	        if (window.DeviceOrientationEvent) {
	          this.active = !this.active;
	        }
	      }
	    },
	    active: {
	
	      /**
	      Whether the interface is on (emitting values) or off (paused & not emitting values). Setting this property will update it.
	      @type {boolean}
	      */
	
	      get: function () {
	        return this._active;
	      },
	      set: function (on) {
	        this._active = on;
	        this.colorInterface();
	      }
	    },
	    customDestroy: {
	      value: function customDestroy() {
	        window.removeEventListener("deviceorientation", this.boundUpdate, false);
	      }
	    }
	  });
	
	  return Tilt;
	})(Interface);
	
	module.exports = Tilt;

/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var math = __webpack_require__(5);
	var svg = __webpack_require__(4);
	var Interface = __webpack_require__(6);
	
	/**
	 * Multislider
	 *
	 * @description Multislider
	 *
	 * @demo <span nexus-ui="multislider"></span>
	 *
	 * @example
	 * var multislider = new Nexus.Multislider('#target')
	 *
	 * @example
	 * var multislider = new Nexus.Multislider('#target',{
	 *  'size': [200,100],
	 *  'numberOfSliders': 5,
	 *  'min': 0,
	 *  'max': 1,
	 *  'step': 0,
	 *  'candycane': 3,
	 *  'values': [0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.1],
	 *  'smoothing': 0,
	 *  'mode': 'bar'  // 'bar' or 'line'
	 *})
	 *
	 * @output
	 * change
	 * Fires any time the interface's value changes. <br>
	 * The event data is an object containing <i>index</i> and <i>value</i> properties
	 *
	 * @outputexample
	 * multislider.on('change',function(v) {
	 *   console.log(v);
	 * })
	 *
	 */
	
	var Multislider = (function (_Interface) {
	  function Multislider() {
	    _classCallCheck(this, Multislider);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [200, 100],
	      numberOfSliders: 5,
	      min: 0,
	      max: 1,
	      step: 0,
	      candycane: 3,
	      values: [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
	      smoothing: 0,
	      mode: "bar" // 'bar', 'line'
	    };
	
	    _get(Object.getPrototypeOf(Multislider.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this._numberOfSliders = this.settings.numberOfSliders;
	    this._min = this.settings.min;
	    this._max = this.settings.max;
	    this._step = this.settings.step;
	
	    this._mode = this.settings.mode;
	
	    /**
	    The current values of the slider. NOTE: Use this only to get the current values. Setting this array will not update the multislider. To set the multislider's values, use setSlider() or setAllSliders()
	    @type {Array}
	    */
	    var vs = this.settings.values;
	    this.values = vs.length > this._numberOfSliders ? vs.slice(0, this._numberOfSliders) : vs.concat(Array(this._numberOfSliders - vs.length).fill(0));
	
	    this.candycane = this.settings.candycane;
	
	    this.sliderWidth = this.width / this.values.length;
	
	    /**
	    Applies a simple low-pass filter to the multislider as it is interacted with. A smoothing of 0 will be no smoothing. A smoothing of 1 will smooth 1 slider on each side of the interaction. A smoothing of 2 will smooth 2 sliders on each side, and so on.
	    @type {Number}
	    */
	    this.smoothing = this.settings.smoothing;
	
	    this.init();
	    this.render();
	  }
	
	  _inherits(Multislider, _Interface);
	
	  _createClass(Multislider, {
	    buildInterface: {
	      value: function buildInterface() {
	        if (this._mode == "line") {
	          this.line = svg.create("polyline");
	          this.line.setAttribute("stroke-width", 2);
	          this.line.setAttribute("fill", "none");
	
	          this.element.appendChild(this.line);
	
	          this.fill = svg.create("polyline");
	          this.fill.setAttribute("fill-opacity", "0.2");
	
	          this.element.appendChild(this.fill);
	
	          this.nodes = [];
	
	          this.values.forEach((function (value, index) {
	            var node = svg.create("circle");
	
	            node.setAttribute("cx", this.getX(index));
	            node.setAttribute("cy", this.getY(value));
	
	            this.element.appendChild(node);
	            this.nodes.push(node);
	          }).bind(this));
	        } else {
	          this.bars = [];
	          this.caps = [];
	
	          this.values.forEach((function (value, index) {
	            var bar = svg.create("rect");
	
	            var x = this.getBarX(index);
	            var y = this.getY(value);
	
	            bar.setAttribute("x", x - 0.1);
	            bar.setAttribute("y", y);
	            bar.setAttribute("width", this.sliderWidth + 0.2);
	            bar.setAttribute("height", this.height);
	            bar.setAttribute("opacity", 1 - (index % this.candycane + 1) / (this.candycane + 1));
	
	            this.element.appendChild(bar);
	            this.bars.push(bar);
	
	            var cap = svg.create("rect");
	
	            cap.setAttribute("x", x - 0.1);
	            cap.setAttribute("y", y);
	            cap.setAttribute("width", this.sliderWidth + 0.2);
	            cap.setAttribute("height", 5);
	
	            this.element.appendChild(cap);
	            this.caps.push(cap);
	          }).bind(this));
	        }
	      }
	    },
	    getBarX: {
	      value: function getBarX(index) {
	        return this.getX(index) - this.sliderWidth / 2;
	      }
	    },
	    getX: {
	      value: function getX(index) {
	        //return Math.floor( index * this.sliderWidth + this.sliderWidth/2 );
	        return index * this.sliderWidth + this.sliderWidth / 2;
	      }
	    },
	    getY: {
	      value: function getY(value) {
	        return math.scale(value, this._min, this._max, this.height, 0); //(1 - value) * this.height;
	      }
	    },
	    getValueFromY: {
	      value: function getValueFromY(y) {
	        var scaleAdjusted = math.scale(y, this.height, 0, this._min, this._max);
	        return this.adjustValueToStep(scaleAdjusted);
	      }
	    },
	    getIndexFromX: {
	      value: function getIndexFromX(x) {
	        return math.clip(Math.floor(x / this.width * this.values.length), 0, this.values.length - 1);
	      }
	    },
	    adjustValueToStep: {
	      value: function adjustValueToStep(value) {
	        if (!this._step) {
	          return value;
	        }
	        var offset = value % this._step;
	        value = value - value % this._step;
	        if (offset > this._step / 2) {
	          value += this._step;
	        }
	        return value;
	      }
	    },
	    adjustAllValues: {
	      value: function adjustAllValues() {
	        this.values.forEach((function (value, index) {
	          value = this.adjustValueToStep(value);
	          this.values[index] = math.clip(value, this._min, this._max);
	        }).bind(this));
	      }
	    },
	    getNormalizedValues: {
	      value: function getNormalizedValues() {
	        this.normalizedValues = [];
	        this.values.forEach((function (value) {
	          this.normalizedValues.push(math.scale(value, this._min, this._max, 0, 1));
	        }).bind(this));
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        var _this = this;
	
	        this.element.style.backgroundColor = this.colors.fill;
	
	        if (this._mode == "line") {
	          this.line.setAttribute("stroke", this.colors.accent);
	          this.fill.setAttribute("fill", this.colors.accent);
	          this.nodes.forEach(function (node) {
	            node.setAttribute("fill", _this.colors.accent);
	          });
	        } else {
	          this.bars.forEach(function (bar) {
	            bar.setAttribute("fill", _this.colors.accent);
	          });
	          this.caps.forEach(function (cap) {
	            cap.setAttribute("fill", _this.colors.accent);
	          });
	        }
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	        this.sliderWidth = this.width / this.values.length;
	
	        if (this._mode == "line") {
	          this.nodes.forEach((function (node) {
	            var r = ~ ~(Math.min(this.width, this.height) / 50) + 2;
	            r = Math.min(this.sliderWidth, r);
	            node.setAttribute("r", r);
	          }).bind(this));
	        }
	
	        this.render();
	      }
	    },
	    render: {
	      value: function render() {
	        var _this = this;
	
	        if (this._mode == "line") {
	          (function () {
	            var data = "0 " + _this.getY(_this.values[0]) + ", ";
	
	            _this.values.forEach(function (value, index) {
	              var x = _this.getX(index);
	              var y = _this.getY(value);
	              data += x + " " + y + ", ";
	              _this.nodes[index].setAttribute("cx", _this.getX(index));
	              _this.nodes[index].setAttribute("cy", _this.getY(value));
	            });
	
	            data += _this.width + " " + _this.getY(_this.values[_this.values.length - 1]);
	
	            _this.line.setAttribute("points", data);
	
	            // fill data
	            // add bottom corners
	
	            data += ", " + _this.width + " " + _this.height + ", ";
	            data += "0 " + _this.height;
	
	            _this.fill.setAttribute("points", data);
	          })();
	        } else {
	          this.values.forEach(function (value, index) {
	            _this.bars[index].setAttribute("y", _this.getY(value));
	            _this.caps[index].setAttribute("y", _this.getY(value));
	          });
	        }
	      }
	    },
	    click: {
	      value: function click() {
	        this.hasMoved = false;
	        this.previousSlider = false;
	        this.move();
	      }
	    },
	    move: {
	      value: function move() {
	        if (this.clicked) {
	          this.mouse.x = math.clip(this.mouse.x, 0, this.width);
	          this.mouse.y = math.clip(this.mouse.y, 0, this.height);
	          this.hasMoved = true;
	
	          this.selectedSlider = this.getIndexFromX(this.mouse.x);
	
	          this.values[this.selectedSlider] = this.getValueFromY(this.mouse.y);
	
	          /* handle interpolation for in-between sliders */
	
	          if (this.previousSlider !== false) {
	            var distance = Math.abs(this.previousSlider - this.selectedSlider);
	            if (distance > 1) {
	              var low = Math.min(this.previousSlider, this.selectedSlider);
	              var high = Math.max(this.previousSlider, this.selectedSlider);
	              var lowValue = this.values[low];
	              var highValue = this.values[high];
	              for (var _i = low; _i < high; _i++) {
	                this.values[_i] = math.interp((_i - low) / distance, lowValue, highValue);
	                this.values[_i] = this.adjustValueToStep(this.values[_i]);
	              }
	            }
	          }
	
	          if (this.smoothing > 0) {
	            for (var i = 1; i <= this.smoothing; i++) {
	              var downCenter = this.selectedSlider - i;
	              var upCenter = this.selectedSlider + i;
	
	              if (downCenter >= 1) {
	                var downLowerNeighbor = downCenter - 1 >= 0 ? downCenter - 1 : 0;
	                var downUpperNeighbor = downCenter + 1;
	                this.values[downCenter] = (this.values[downLowerNeighbor] + this.values[downUpperNeighbor]) / 2;
	                this.values[downCenter] = this.adjustValueToStep(this.values[downCenter]);
	              }
	
	              if (upCenter < this.values.length - 1) {
	                var upLowerNeighbor = upCenter - 1;
	                var upUpperNeighbor = upCenter + 1 < this.values.length ? upCenter + 1 : this.values.length - 1;
	                this.values[upCenter] = (this.values[upLowerNeighbor] + this.values[upUpperNeighbor]) / 2;
	                this.values[upCenter] = this.adjustValueToStep(this.values[upCenter]);
	              }
	            }
	          }
	
	          this.previousSlider = this.selectedSlider;
	
	          this.emit("change", this.values);
	          this.render();
	        }
	      }
	    },
	    scan: {
	
	      // would be a cool API call to have for later...
	
	      value: function scan() {}
	    },
	    update: {
	      value: function update(index, value) {
	        this.values[index] = this.adjustValueToStep(value);
	        this.emit("change", {
	          index: index,
	          value: value
	        });
	      }
	    },
	    numberOfSliders: {
	
	      /**
	      Get the number of sliders
	      @type {Number}
	      */
	
	      get: function () {
	        return this.values.length;
	      }
	    },
	    min: {
	
	      /**
	      Lower limit of the multislider's output range
	      @type {number}
	      @example multislider.min = 1000;
	      */
	
	      get: function () {
	        return this._min;
	      },
	      set: function (v) {
	        this._min = v;
	        this.adjustAllValues();
	        this.render();
	      }
	    },
	    max: {
	
	      /**
	      Upper limit of the multislider's output range
	      @type {number}
	      @example multislider.max = 1000;
	      */
	
	      get: function () {
	        return this._max;
	      },
	      set: function (v) {
	        this._max = v;
	        this.adjustAllValues();
	        this.render();
	      }
	    },
	    step: {
	
	      /**
	      The increment that the multislider's value changes by.
	      @type {number}
	      @example multislider.step = 5;
	      */
	
	      get: function () {
	        return this._step;
	      },
	      set: function (v) {
	        this._step = v;
	        this.adjustAllValues();
	        this.render();
	      }
	    },
	    setSlider: {
	
	      /**
	      Set the value of an individual slider
	      @param index {number} Slider index
	      @param value {number} New slider value
	      @example
	      // Set the first slider to value 0.5
	      multislider.setSlider(0,0.5)
	      */
	
	      value: function setSlider(index, value) {
	        this.values[index] = this.adjustValueToStep(value);
	        this.values[index] = math.clip(this.values[index], this._min, this._max);
	        this.emit("change", {
	          index: index,
	          value: value
	        });
	      }
	    },
	    setAllSliders: {
	
	      /**
	      Set the value of all sliders at once. If the size of the input array does not match the current number of sliders, the value array will repeat until all sliders have been set. I.e. an input array of length 1 will set all sliders to that value.
	      @param values {Array} All slider values
	      @example
	      multislider.setAllSliders([0.2,0.3,0.4,0.5,0.6])
	      */
	
	      value: function setAllSliders(values) {
	        var previousLength = this.values.length;
	        var newLength = values.length;
	        this.values = values;
	        this.adjustAllValues();
	        if (previousLength != newLength) {
	          this.empty();
	          this.buildInterface();
	          this.colorInterface();
	        }
	        this.sizeInterface();
	      }
	    }
	  });
	
	  return Multislider;
	})(Interface);
	
	module.exports = Multislider;

/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequireWildcard = function (obj) { return obj && obj.__esModule ? obj : { "default": obj }; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var svg = __webpack_require__(4);
	var math = __webpack_require__(5);
	var Interface = __webpack_require__(6);
	var Step = __webpack_require__(11);
	
	var Interaction = _interopRequireWildcard(__webpack_require__(12));
	
	/**
	* Pan
	*
	* @description Stereo crossfader.
	*
	* @demo <span nexus-ui="pan"></span>
	*
	* @example
	* var pan = new Nexus.Pan('#target')
	*
	* @output
	* change
	* Fires any time the interface's value changes. <br>
	* The event data is an object containing the interface's <i>value</i> (-1 to 1), as well as <i>L</i> and <i>R</i> amplitude values (0-1) for left and right speakers, calculated by a square-root crossfade algorithm.
	*
	* @outputexample
	* pan.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*
	*/
	
	var Pan = (function (_Interface) {
	  function Pan() {
	    _classCallCheck(this, Pan);
	
	    var options = ["scale", "value"];
	
	    var defaults = {
	      size: [120, 20],
	      orientation: "horizontal",
	      mode: "relative",
	      scale: [-1, 1],
	      step: 0,
	      value: 0,
	      hasKnob: true
	    };
	
	    _get(Object.getPrototypeOf(Pan.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.orientation = this.settings.orientation;
	
	    this.mode = this.settings.mode;
	
	    this.hasKnob = this.settings.hasKnob;
	
	    // this.step should eventually be get/set
	    // updating it will update the _value step model
	    this.step = this.settings.step; // float
	
	    this._value = new Step(this.settings.scale[0], this.settings.scale[1], this.settings.step, this.settings.value);
	
	    this.init();
	
	    this.position = new Interaction.Handle(this.mode, this.orientation, [0, this.width], [this.height, 0]);
	    this.position.value = this._value.normalized;
	
	    this.value = this._value.value;
	
	    this.emit("change", this.value);
	  }
	
	  _inherits(Pan, _Interface);
	
	  _createClass(Pan, {
	    buildInterface: {
	      value: function buildInterface() {
	
	        this.bar = svg.create("rect");
	        this.knob = svg.create("circle");
	
	        this.element.appendChild(this.bar);
	        this.element.appendChild(this.knob);
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        if (this.position) {
	          this.position.resize([0, this.width], [this.height, 0]);
	        }
	
	        if (this.width < this.height) {
	          this.orientation = "vertical";
	        } else {
	          this.orientation = "horizontal";
	        }
	
	        var x = undefined,
	            y = undefined,
	            w = undefined,
	            h = undefined,
	            barOffset = undefined,
	            cornerRadius = undefined;
	        this.knobData = {
	          level: 0,
	          r: 0
	        };
	
	        if (this.orientation === "vertical") {
	          this.thickness = this.width / 2;
	          x = this.width / 2;
	          y = 0;
	          w = this.thickness;
	          h = this.height;
	          this.knobData.r = this.thickness * 0.8;
	          this.knobData.level = h - this.knobData.r - this.normalized * (h - this.knobData.r * 2);
	          barOffset = "translate(" + this.thickness * -1 / 2 + ",0)";
	          cornerRadius = w / 2;
	        } else {
	          this.thickness = this.height / 2;
	          x = 0;
	          y = this.height / 2;
	          w = this.width;
	          h = this.thickness;
	          this.knobData.r = this.thickness * 0.8;
	          this.knobData.level = this.normalized * (w - this.knobData.r * 2) + this.knobData.r;
	          barOffset = "translate(0," + this.thickness * -1 / 2 + ")";
	          cornerRadius = h / 2;
	        }
	
	        this.bar.setAttribute("x", x);
	        this.bar.setAttribute("y", y);
	        this.bar.setAttribute("transform", barOffset);
	        this.bar.setAttribute("rx", cornerRadius); // corner radius
	        this.bar.setAttribute("ry", cornerRadius);
	        this.bar.setAttribute("width", w);
	        this.bar.setAttribute("height", h);
	
	        if (this.orientation === "vertical") {
	          this.knob.setAttribute("cx", x);
	          this.knob.setAttribute("cy", this.knobData.level);
	        } else {
	          this.knob.setAttribute("cx", this.knobData.level);
	          this.knob.setAttribute("cy", y);
	        }
	        this.knob.setAttribute("r", this.knobData.r);
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	
	        this.bar.setAttribute("fill", this.colors.fill);
	        this.knob.setAttribute("fill", this.colors.accent);
	
	        if (!this.hasKnob) {
	          this.knob.setAttribute("fill", "transparent");
	        }
	      }
	    },
	    render: {
	      value: function render() {
	        if (!this.clicked) {
	          this.knobData.r = this.thickness * 0.75;
	        }
	        this.knob.setAttribute("r", this.knobData.r);
	
	        if (this.orientation === "vertical") {
	          this.knobData.level = this.knobData.r + this._value.normalized * (this.height - this.knobData.r * 2);
	          this.knob.setAttribute("cy", this.height - this.knobData.level);
	        } else {
	          this.knobData.level = this._value.normalized * (this.width - this.knobData.r * 2) + this.knobData.r;
	          this.knob.setAttribute("cx", this.knobData.level);
	        }
	      }
	    },
	    click: {
	      value: function click() {
	        this.knobData.r = this.thickness * 0.9;
	        this.position.anchor = this.mouse;
	        this.move();
	      }
	    },
	    move: {
	      value: function move() {
	        if (this.clicked) {
	          this.position.update(this.mouse);
	
	          this.value = this._value.updateNormal(this.position.value);
	
	          this.emit("change", {
	            value: this.value,
	            L: Math.pow(math.scale(this.value, -1, 1, 1, 0), 2),
	            R: Math.pow(math.scale(this.value, -1, 1, 0, 1), 2)
	          });
	        }
	      }
	    },
	    release: {
	      value: function release() {
	        this.render();
	      }
	    },
	    value: {
	
	      /**
	      The position of crossfader, from -1 (left) to 1 (right). Setting this value updates the interface and triggers the output event.
	      @type {number}
	      */
	
	      get: function () {
	        return this._value.value;
	      },
	      set: function (value) {
	        this._value.update(value);
	        this.position.value = this._value.normalized;
	        this.emit("change", {
	          value: this.value,
	          L: Math.pow(math.scale(this.value, -1, 1, 1, 0), 2),
	          R: Math.pow(math.scale(this.value, -1, 1, 0, 1), 2)
	        });
	        this.render();
	      }
	    },
	    normalized: {
	      get: function () {
	        return this._value.normalized;
	      }
	    }
	  });
	
	  return Pan;
	})(Interface);
	
	module.exports = Pan;

/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var math = __webpack_require__(5);
	var svg = __webpack_require__(4);
	var Interface = __webpack_require__(6);
	
	var Point = function Point(point, envelope) {
	
	  this.x = point.x;
	  this.y = point.y;
	
	  this.xMin = point.xMin || 0;
	  this.xMax = point.xMax || 1;
	  this.yMin = point.yMin || 0;
	  this.yMax = point.yMax || 1;
	
	  this.envelope = envelope;
	
	  this.element = svg.create("circle");
	  this.element.setAttribute("fill", this.envelope.colors.accent);
	
	  this.envelope.element.appendChild(this.element);
	
	  this.resize = function () {
	    var r = ~ ~(Math.min(this.envelope.width, this.envelope.height) / 50) + 2;
	    this.element.setAttribute("r", r);
	  };
	
	  this.move = function (x, y) {
	
	    this.x = x || x === 0 ? x : this.x;
	    this.y = y || y === 0 ? y : this.y;
	
	    if (this.envelope.nodes.indexOf(this) >= 0) {
	
	      var prevIndex = this.envelope.nodes.indexOf(this) - 1;
	      var nextIndex = this.envelope.nodes.indexOf(this) + 1;
	
	      var prevNode = this.envelope.nodes[prevIndex];
	      var nextNode = this.envelope.nodes[nextIndex];
	
	      var lowX = prevIndex >= 0 ? prevNode.x : 0;
	      lowX = lowX < this.xMin ? this.xMin : lowX;
	
	      var highX = nextIndex < this.envelope.nodes.length ? nextNode.x : 1;
	      highX = highX > this.xMax ? this.xMax : highX;
	
	      if (this.x < lowX) {
	        this.x = lowX;
	      }
	      if (this.x > highX) {
	        this.x = highX;
	      }
	
	      if (this.y < this.yMin) {
	        this.y = this.yMin;
	      }
	      if (this.y > this.yMax) {
	        this.y = this.yMax;
	      }
	    }
	
	    this.location = this.getCoordinates();
	    this.element.setAttribute("cx", this.location.x);
	    this.element.setAttribute("cy", this.location.y);
	  };
	
	  this.getCoordinates = function () {
	    return {
	      x: this.x * this.envelope.width,
	      y: (1 - this.y) * this.envelope.height
	    };
	  };
	
	  this.move(this.x, this.y, true);
	  this.resize();
	
	  this.destroy = function () {
	    this.envelope.element.removeChild(this.element);
	    this.envelope.nodes.splice(this.envelope.nodes.indexOf(this), 1);
	  };
	};
	
	/**
	* Envelope
	*
	* @description Interactive linear ramp visualization.
	*
	* @demo <span nexus-ui="envelope"></span>
	*
	* @example
	* var envelope = new Nexus.Envelope('#target')
	*
	* @example
	* var envelope = new Nexus.Envelope('#target',{
	*   'size': [300,150],
	*   'noNewPoints': false,
	*   'points': [
	*     {
	*       x: 0.1,
	*       y: 0.4
	*     },
	*     {
	*       x: 0.35,
	*       y: 0.6
	*     },
	*     {
	*       x: 0.65,
	*       y: 0.2
	*     },
	*     {
	*       x: 0.9,
	*       y: 0.4
	*     },
	*   ]
	* })
	*
	* @output
	* change
	* Fires any time a node is moved. <br>
	* The event data is an array of point locations. Each item in the array is an object containing <i>x</i> and <i>y</i> properties describing the location of a point on the envelope.
	*
	* @outputexample
	* envelope.on('change',function(v) {
	*   console.log(v);
	* })
	*
	*/
	
	var Envelope = (function (_Interface) {
	  function Envelope() {
	    _classCallCheck(this, Envelope);
	
	    var options = ["value"];
	
	    var defaults = {
	      size: [300, 150],
	      noNewPoints: false,
	      points: [{
	        x: 0.1,
	        y: 0.4
	      }, {
	        x: 0.35,
	        y: 0.6
	      }, {
	        x: 0.65,
	        y: 0.2
	      }, {
	        x: 0.9,
	        y: 0.4
	      }]
	    };
	
	    _get(Object.getPrototypeOf(Envelope.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.points = this.settings.points;
	
	    this.nodes = [];
	
	    this.selected = false;
	
	    this.init();
	  }
	
	  _inherits(Envelope, _Interface);
	
	  _createClass(Envelope, {
	    buildInterface: {
	      value: function buildInterface() {
	        var _this = this;
	
	        this.points.forEach(function (point) {
	          var node = new Point(point, _this);
	          _this.nodes.push(node);
	        });
	
	        this.sortPoints();
	
	        this.line = svg.create("polyline");
	        this.line.setAttribute("stroke-width", 2);
	        this.line.setAttribute("fill", "none");
	
	        this.element.appendChild(this.line);
	
	        this.fill = svg.create("polyline");
	        this.fill.setAttribute("fill-opacity", "0.2");
	
	        this.element.appendChild(this.fill);
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	
	        for (var i = 0; i < this.nodes.length; i++) {
	          this.nodes[i].resize();
	          this.nodes[i].move();
	        }
	
	        this.render();
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        var _this = this;
	
	        this.element.style.backgroundColor = this.colors.fill;
	        this.line.setAttribute("stroke", this.colors.accent);
	        this.fill.setAttribute("fill", this.colors.accent);
	        this.nodes.forEach(function (node) {
	          node.element.setAttribute("fill", _this.colors.accent);
	        });
	      }
	    },
	    render: {
	      value: function render() {
	        //  this.nodes[this.selected].move( this.points )
	        this.calculatePath();
	      }
	    },
	    calculatePoints: {
	      value: function calculatePoints() {
	        var _this = this;
	
	        this.points = [];
	        this.nodes.forEach(function (node) {
	          _this.points.push({ x: node.x, y: node.y });
	        });
	      }
	    },
	    calculatePath: {
	      value: function calculatePath() {
	
	        //stroke data
	        var data = "0 " + this.nodes[0].location.y + ", ";
	
	        // data should be re-ordered based on x location.
	        // whatever function adds a node should add it at the right index
	
	        this.nodes.forEach(function (node) {
	          //  let location = node.getCoordinates();
	          data += node.location.x + " " + node.location.y + ", ";
	        });
	
	        //  data += point.x*this.width+' '+ point.y*this.height+', ';
	        data += this.width + " " + this.nodes[this.nodes.length - 1].location.y;
	
	        this.line.setAttribute("points", data);
	
	        // fill data
	        // add bottom corners
	
	        data += ", " + this.width + " " + this.height + ", ";
	        data += "0 " + this.height;
	
	        this.fill.setAttribute("points", data);
	      }
	    },
	    click: {
	      value: function click() {
	        // find nearest node and set this.selected (index)
	        this.hasMoved = false;
	        this.selected = this.findNearestNode();
	
	        this.nodes[this.selected].move(this.mouse.x / this.width, 1 - this.mouse.y / this.height);
	        this.scaleNode(this.selected);
	
	        // must do this b/c new node may have been created
	        this.calculatePoints();
	        this.emit("change", this.points);
	        this.render();
	      }
	    },
	    move: {
	      value: function move() {
	        if (this.clicked) {
	          this.mouse.x = math.clip(this.mouse.x, 0, this.width);
	          this.hasMoved = true;
	
	          this.nodes[this.selected].move(this.mouse.x / this.width, 1 - this.mouse.y / this.height);
	          this.scaleNode(this.selected);
	
	          this.calculatePoints();
	          this.emit("change", this.points);
	          this.render();
	        }
	      }
	    },
	    release: {
	      value: function release() {
	
	        if (!this.hasMoved) {
	          this.nodes[this.selected].destroy();
	        }
	
	        this.calculatePoints();
	        this.emit("change", this.points);
	        this.render();
	
	        // reset this.selected
	        this.selected = null;
	      }
	    },
	    findNearestNode: {
	      value: function findNearestNode() {
	        var nearestIndex = null;
	        // set this unreasonably high so that every distance will be lower than it.
	        var nearestDist = 10000;
	        var before = false;
	        var x = this.mouse.x / this.width;
	        var y = 1 - this.mouse.y / this.height;
	        var nodes = this.nodes;
	        for (var i = 0; i < nodes.length; i++) {
	
	          // calculate the distance from mouse to this node using pythagorean theorem
	          var distance = Math.sqrt(Math.pow(nodes[i].x - x, 2) + Math.pow(nodes[i].y - y, 2));
	
	          // if this distance is less than the previous shortest distance, use this index
	          if (distance < nearestDist) {
	            nearestDist = distance;
	            nearestIndex = i;
	            before = x > nodes[i].x;
	          }
	        }
	
	        // if not very close to any node, create a node
	        if (!this.settings.noNewPoints && nearestDist > 0.07) {
	
	          nearestIndex = this.getIndexFromX(this.mouse.x / this.width);
	
	          this.nodes.splice(nearestIndex, 0, new Point({
	            x: this.mouse.x / this.width,
	            y: 1 - this.mouse.y / this.height
	          }, this));
	          this.hasMoved = true;
	        }
	
	        return nearestIndex;
	      }
	    },
	    getIndexFromX: {
	      value: function getIndexFromX(x) {
	        var _this = this;
	
	        var index = 0;
	        this.nodes.forEach(function (node, i) {
	          if (_this.nodes[i].x <= x) {
	            index = i + 1;
	          }
	        });
	        return index;
	      }
	    },
	    scaleNode: {
	      value: function scaleNode(i) {
	
	        var clippedX = math.clip(this.nodes[i].x, 0, 1);
	        var clippedY = math.clip(this.nodes[i].y, 0, 1);
	
	        this.nodes[i].move(clippedX, clippedY);
	      }
	    },
	    sortPoints: {
	
	      /**
	      Sort the this.points array from left-most point to right-most point. You should not regularly need to use this, however it may be useful if the points get unordered.
	      */
	
	      value: function sortPoints() {
	        this.nodes.sort(function (a, b) {
	          return a.x > b.x;
	        });
	      }
	    },
	    addPoint: {
	
	      /**
	      Add a breakpoint on the envelope.
	      @param x {number} x location of the point, normalized (0-1)
	      @param y {number} y location of the point, normalized (0-1)
	      */
	
	      value: function addPoint(x, y) {
	        var index = this.nodes.length;
	
	        this.sortPoints();
	
	        for (var i = 0; i < this.nodes.length; i++) {
	          if (x < this.nodes[i].x) {
	            index = i;
	            break;
	          }
	        }
	
	        this.nodes.splice(index, 0, new Point({
	          x: x,
	          y: y
	        }, this));
	
	        this.scaleNode(index);
	
	        this.calculatePoints();
	        this.emit("change", this.points);
	
	        this.render();
	      }
	    },
	    scan: {
	
	      /**
	      Find the level at a certain x location on the envelope.
	      @param x {number} The x location to find the level of, normalized 0-1
	      */
	
	      value: function scan(x) {
	        // find surrounding points
	        var nextIndex = this.getIndexFromX(x);
	        var priorIndex = nextIndex - 1;
	        if (priorIndex < 0) {
	          priorIndex = 0;
	        }
	        if (nextIndex >= this.nodes.length) {
	          nextIndex = this.nodes.length - 1;
	        }
	        var priorPoint = this.nodes[priorIndex];
	        var nextPoint = this.nodes[nextIndex];
	        var loc = math.scale(x, priorPoint.x, nextPoint.x, 0, 1);
	        var value = math.interp(loc, priorPoint.y, nextPoint.y);
	        this.emit("scan", value);
	        return value;
	      }
	    },
	    movePoint: {
	
	      /**
	      Move a breakpoint on the envelope.
	      @param index {number} The index of the breakpoint to move
	      @param x {number} New x location, normalized 0-1
	      @param y {number} New y location, normalized 0-1
	      */
	
	      value: function movePoint(index, x, y) {
	        this.nodes[index].move(x, y);
	        this.scaleNode(index);
	        this.calculatePoints();
	        this.emit("change", this.points);
	        this.render();
	      }
	    },
	    adjustPoint: {
	
	      /**
	      Move a breakpoint on the envelope by a certain amount.
	      @param index {number} The index of the breakpoint to move
	      @param xOffset {number} X displacement, normalized 0-1
	      @param yOffset {number} Y displacement, normalized 0-1
	      */
	
	      value: function adjustPoint(index, xOffset, yOffset) {
	        this.nodes[index].move(this.nodes[index].x + xOffset, this.nodes[index].y + yOffset);
	        this.scaleNode(index);
	        this.calculatePoints();
	        this.emit("change", this.points);
	        this.render();
	      }
	    },
	    destroyPoint: {
	
	      /**
	      Remove a breakpoint from the envelope.
	      @param index {number} Index of the breakpoint to remove
	      */
	
	      value: function destroyPoint(index) {
	        this.nodes[index].destroy();
	        this.calculatePoints();
	        this.emit("change", this.points);
	        this.render();
	      }
	    },
	    setPoints: {
	
	      /**
	      Remove all existing breakpoints and add an entirely new set of breakpoints.
	      @param allPoints {array} An array of objects with x/y properties (normalized 0-1). Each object in the array specifices the x/y location of a new breakpoint to be added.
	      */
	
	      value: function setPoints(allPoints) {
	        var _this = this;
	
	        while (this.nodes.length) {
	          this.nodes[0].destroy();
	        }
	        allPoints.forEach(function (point) {
	          _this.addPoint(point.x, point.y);
	        });
	        this.calculatePoints();
	        this.emit("change", this.points);
	        this.render();
	      }
	    }
	  });
	
	  return Envelope;
	})(Interface);
	
	module.exports = Envelope;

/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var dom = __webpack_require__(7);
	var Interface = __webpack_require__(6);
	
	/**
	 * Spectrogram
	 *
	 * @description Audio spectrum visualization
	 *
	 * @demo <span nexus-ui="spectrogram"></span>
	 *
	 * @example
	 * var spectrogram = new Nexus.Spectrogram('#target')
	 * spectrogram.connect(myWebAudioNode)
	 *
	 * @example
	 * var spectrogram = new Nexus.Spectrogram('#target',{
	 *   'size': [300,150]
	 * })
	 * spectrogram.connect(myWebAudioNode)
	 *
	 * @output
	 * &nbsp;
	 * No events
	 *
	 */
	
	var Spectrogram = (function (_Interface) {
	  function Spectrogram() {
	    _classCallCheck(this, Spectrogram);
	
	    var options = [];
	
	    var defaults = {
	      size: [300, 150]
	    };
	
	    _get(Object.getPrototypeOf(Spectrogram.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.analyser = null;
	    this.bufferLength = 0;
	    this.dataArray = null;
	    this.active = false;
	    this.source = null;
	
	    this.init();
	  }
	
	  _inherits(Spectrogram, _Interface);
	
	  _createClass(Spectrogram, {
	    buildFrame: {
	      value: function buildFrame() {
	        this.canvas = new dom.SmartCanvas(this.parent);
	        this.element = this.canvas.element;
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	        this.canvas.resize(this.width, this.height);
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        this.canvas.element.style.backgroundColor = this.colors.fill;
	      }
	    },
	    render: {
	      value: function render() {
	        if (this.active) {
	          requestAnimationFrame(this.render.bind(this));
	        }
	
	        if (this.analyser) {
	          this.analyser.getByteFrequencyData(this.dataArray);
	        }
	
	        this.canvas.context.fillStyle = this.colors.fill;
	        this.canvas.context.fillRect(0, 0, this.canvas.element.width, this.canvas.element.height);
	
	        if (this.source && this.dataArray) {
	          //console.log(this.dataArray);
	
	          var barWidth = this.canvas.element.width / this.bufferLength;
	          var barHeight = undefined;
	          var x = 0;
	
	          var definition = this.canvas.element.width / 50;
	
	          for (var i = 0; i < this.bufferLength; i = i + definition) {
	            barHeight = Math.max.apply(null, this.dataArray.subarray(i, i + definition));
	            barHeight /= 255;
	            barHeight *= this.canvas.element.height;
	
	            this.canvas.context.fillStyle = this.colors.accent;
	            this.canvas.context.fillRect(x, this.canvas.element.height - barHeight, barWidth * definition, barHeight);
	
	            x += barWidth * definition;
	          }
	        }
	      }
	    },
	    connect: {
	
	      /**
	      Equivalent to "patching in" an audio node to visualize.
	      @param node {AudioNode} The audio node to visualize
	      @example spectrogram.connect( Tone.Master );
	      */
	
	      value: function connect(node) {
	        if (this.source) {
	          this.disconnect();
	        }
	
	        this.analyser = node.context.createAnalyser();
	        this.analyser.fftSize = 2048;
	        this.bufferLength = this.analyser.frequencyBinCount;
	        this.dataArray = new Uint8Array(this.bufferLength);
	
	        this.active = true;
	
	        this.source = node;
	        this.source.connect(this.analyser);
	
	        this.render();
	      }
	    },
	    disconnect: {
	
	      /**
	      Stop visualizing the source node and disconnect it.
	      */
	
	      value: function disconnect() {
	        if (this.source) {
	          this.source.disconnect(this.analyser);
	        }
	
	        this.analyser = null;
	        this.bufferLength = 0;
	        this.dataArray = null;
	        this.active = false;
	        this.source = null;
	      }
	    },
	    click: {
	      value: function click() {
	        this.active = !this.active && this.source;
	        this.render();
	      }
	    },
	    customDestroy: {
	      value: function customDestroy() {
	        this.active = false;
	      }
	    }
	  });
	
	  return Spectrogram;
	})(Interface);
	
	module.exports = Spectrogram;

/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var dom = __webpack_require__(7);
	var math = __webpack_require__(5);
	var Interface = __webpack_require__(6);
	
	/**
	 * Meter
	 *
	 * @description Stereo decibel meter
	 *
	 * @demo <span nexus-ui="meter"></span>
	 *
	 * @example
	 * var meter = new Nexus.Meter('#target')
	 * meter.connect(myWebAudioNode)
	 *
	 * @example
	 * var meter = new Nexus.Meter('#target', {
	 *   size: [75,75]
	 * })
	 * meter.connect(myWebAudioNode)
	 *
	 * @output
	 * &nbsp;
	 * No events
	 *
	 */
	
	var Meter = (function (_Interface) {
	  function Meter() {
	    _classCallCheck(this, Meter);
	
	    var options = [];
	
	    var defaults = {
	      size: [30, 100]
	    };
	
	    _get(Object.getPrototypeOf(Meter.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.channels = 2;
	    this.splitter = null;
	    this.analysers = [];
	    this.bufferLength = 0;
	    this.dataArray = null;
	    this.active = false;
	    this.source = null;
	    this.db = -Infinity;
	
	    this.init();
	
	    this.meterWidth = this.canvas.element.width / this.channels;
	
	    this.render();
	  }
	
	  _inherits(Meter, _Interface);
	
	  _createClass(Meter, {
	    buildFrame: {
	      value: function buildFrame() {
	        this.canvas = new dom.SmartCanvas(this.parent);
	        this.element = this.canvas.element;
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	        this.canvas.resize(this.width, this.height);
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        this.canvas.element.style.backgroundColor = this.colors.fill;
	      }
	    },
	    render: {
	      value: function render() {
	        if (this.active) {
	          requestAnimationFrame(this.render.bind(this));
	        }
	
	        this.canvas.context.fillStyle = this.colors.fill;
	        this.canvas.context.fillRect(0, 0, this.canvas.element.width, this.canvas.element.height);
	
	        for (var i = 0; i < this.analysers.length; i++) {
	          if (this.source) {
	            this.analysers[i].getFloatTimeDomainData(this.dataArray);
	
	            var rms = 0;
	
	            for (var _i = 0; _i < this.dataArray.length; _i++) {
	              rms += this.dataArray[_i] * this.dataArray[_i];
	            }
	
	            rms = Math.sqrt(rms / this.dataArray.length);
	
	            this.db = 20 * Math.log10(rms);
	          } else if (this.db > -200 && this.db !== -Infinity) {
	            this.db -= 1;
	          } else {
	            this.db = -Infinity;
	          }
	
	          //console.log(db)
	
	          if (this.db > -70) {
	            var linear = math.normalize(this.db, -70, 5);
	            var exp = linear * linear;
	            var y = math.scale(exp, 0, 1, this.element.height, 0);
	
	            this.canvas.context.fillStyle = this.colors.accent;
	            this.canvas.context.fillRect(this.meterWidth * i, y, this.meterWidth, this.canvas.element.height - y);
	
	            //console.log("rendering...")
	          }
	        }
	      }
	    },
	    connect: {
	
	      /**
	      Equivalent to "patching in" an audio node to visualize.
	      @param node {AudioNode} The audio node to visualize
	      @param channels {number} (optional) The number of channels in the source node to watch. If not specified, the interface will look for a .channelCount property on the input node. If it does not exist, the interface will default to 1 channel.
	      @example meter.connect( Tone.Master, 2 );
	      */
	
	      value: function connect(node, channels) {
	        if (this.source) {
	          this.disconnect();
	        }
	
	        this.channels = channels || node.channelCount || 2;
	
	        this.splitter = node.context.createChannelSplitter(this.channels);
	
	        this.analysers = [];
	        for (var i = 0; i < this.channels; i++) {
	          var analyser = node.context.createAnalyser();
	          analyser.fftSize = 1024;
	          analyser.smoothingTimeConstant = 1;
	          this.splitter.connect(analyser, i);
	          this.analysers.push(analyser);
	        }
	        this.bufferLength = this.analysers[0].frequencyBinCount;
	        this.dataArray = new Float32Array(this.bufferLength);
	
	        this.active = true;
	
	        this.meterWidth = this.canvas.element.width / this.channels;
	
	        this.source = node;
	        this.source.connect(this.splitter);
	
	        this.render();
	      }
	    },
	    disconnect: {
	
	      /**
	      Stop visualizing the source node and disconnect it.
	      */
	
	      value: function disconnect() {
	        if (this.source) {
	          this.source.disconnect(this.splitter);
	        }
	
	        this.splitter = null;
	        this.analysers = [];
	        this.bufferLength = 0;
	        this.dataArray = null;
	        this.active = false;
	        this.source = null;
	      }
	    },
	    click: {
	      value: function click() {
	        this.active = !this.active && this.source;
	        this.render();
	      }
	    },
	    customDestroy: {
	      value: function customDestroy() {
	        this.active = false;
	      }
	    }
	  });
	
	  return Meter;
	})(Interface);
	
	module.exports = Meter;

/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc && desc.writable) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
	
	var _inherits = function (subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var dom = __webpack_require__(7);
	var Interface = __webpack_require__(6);
	
	/**
	 * Oscilloscope
	 *
	 * @description Visualizes a waveform's stream of values.
	 *
	 * @demo <span nexus-ui="oscilloscope"></span>
	 *
	 * @example
	 * var oscilloscope = new Nexus.Oscilloscope('#target')
	 * oscilloscope.connect(myWebAudioNode)
	 *
	 * @example
	 * var oscilloscope = new Nexus.Oscilloscope('#target',{
	 *   'size': [300,150]
	 * })
	 * oscilloscope.connect(myWebAudioNode)
	 *
	 * @output
	 * &nbsp;
	 * No events
	 *
	 */
	
	var Oscilloscope = (function (_Interface) {
	  function Oscilloscope() {
	    _classCallCheck(this, Oscilloscope);
	
	    var options = [];
	
	    var defaults = {
	      size: [300, 150]
	    };
	
	    _get(Object.getPrototypeOf(Oscilloscope.prototype), "constructor", this).call(this, arguments, options, defaults);
	
	    this.analyser = null;
	    this.bufferLength = 0;
	    this.dataArray = null;
	
	    this.active = false;
	
	    this.source = null;
	
	    this.init();
	
	    this.render();
	  }
	
	  _inherits(Oscilloscope, _Interface);
	
	  _createClass(Oscilloscope, {
	    buildFrame: {
	      value: function buildFrame() {
	        this.canvas = new dom.SmartCanvas(this.parent);
	        this.element = this.canvas.element;
	      }
	    },
	    sizeInterface: {
	      value: function sizeInterface() {
	        this.canvas.resize(this.width, this.height);
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        this.canvas.element.style.backgroundColor = this.colors.fill;
	      }
	    },
	    render: {
	      value: function render() {
	        if (this.active) {
	          requestAnimationFrame(this.render.bind(this));
	        }
	
	        if (this.analyser) {
	          this.analyser.getByteTimeDomainData(this.dataArray);
	        }
	
	        this.canvas.context.fillStyle = this.colors.fill;
	        this.canvas.context.fillRect(0, 0, this.canvas.element.width, this.canvas.element.height);
	
	        this.canvas.context.lineWidth = ~ ~(this.height / 100 + 2);
	        this.canvas.context.strokeStyle = this.colors.accent;
	
	        this.canvas.context.beginPath();
	
	        if (this.source) {
	          var sliceWidth = this.canvas.element.width * 1 / this.bufferLength;
	          var x = 0;
	
	          for (var i = 0; i < this.bufferLength; i++) {
	            var v = this.dataArray[i] / 128;
	            var y = v * this.canvas.element.height / 2;
	
	            if (i === 0) {
	              this.canvas.context.moveTo(x, y);
	            } else {
	              this.canvas.context.lineTo(x, y);
	            }
	
	            x += sliceWidth;
	          }
	        } else {
	          this.canvas.context.moveTo(0, this.canvas.element.height / 2);
	          this.canvas.context.lineTo(this.canvas.element.width, this.canvas.element.height / 2);
	        }
	
	        this.canvas.context.stroke();
	      }
	    },
	    connect: {
	
	      /**
	      Equivalent to "patching in" an audio node to visualize.
	      @param node {AudioNode} The audio node to visualize
	      @example oscilloscope.connect( Tone.Master );
	      */
	
	      value: function connect(node) {
	        if (this.source) {
	          this.disconnect();
	        }
	
	        this.analyser = node.context.createAnalyser();
	        this.analyser.fftSize = 2048;
	        this.bufferLength = this.analyser.frequencyBinCount;
	        this.dataArray = new Uint8Array(this.bufferLength);
	        this.analyser.getByteTimeDomainData(this.dataArray);
	
	        this.active = true;
	
	        this.source = node;
	        this.source.connect(this.analyser);
	
	        this.render();
	      }
	    },
	    disconnect: {
	
	      /**
	      Stop visualizing the source node and disconnect it.
	      */
	
	      value: function disconnect() {
	        if (this.source) {
	          this.source.disconnect(this.analyser);
	        }
	
	        this.analyser = null;
	        this.bufferLength = 0;
	        this.dataArray = null;
	        this.active = false;
	        this.source = null;
	      }
	    },
	    click: {
	      value: function click() {
	        this.active = !this.active && this.source;
	        this.render();
	      }
	    },
	    customDestroy: {
	      value: function customDestroy() {
	        this.active = false;
	      }
	    }
	  });
	
	  return Oscilloscope;
	})(Interface);
	
	module.exports = Oscilloscope;

/***/ }),
/* 38 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };
	
	var _interopRequireWildcard = function (obj) { return obj && obj.__esModule ? obj : { "default": obj }; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	/*
	Main concept:
	synth = new Nexus.Rack('elementID');
	
	Transform all elements inside the div
	synth.elementID will hold the first slider interface
	
	2) In future, potentially writing a rack that is re-usable?
	Could also take JSON
	
	new Nexus.Rack('#target',{
	  pre: () => {
	    create some divs here, or some audio code
	  },
	  interface: {
	    slider1: Nexus.add.slider({
	      top:10,
	      left:10,
	      width:50,
	      height:100,
	      min: 0,
	      max: 100,
	      step: 1
	    }),
	    wave1: Nexus.add.waveform({
	      file: './path/to/file.mp3',
	      width:500,
	      height:100,
	      mode: 'range'
	    })
	  },
	  init: () => {
	    // some audio init code goes here...
	  }
	});
	
	*/
	
	var transform = _interopRequireWildcard(__webpack_require__(39));
	
	var dom = _interopRequire(__webpack_require__(7));
	
	var colors = __webpack_require__(1).colors;
	
	var Rack = (function () {
	  function Rack(target, settings) {
	    _classCallCheck(this, Rack);
	
	    this.meta = {};
	    this.meta.target = target;
	    this.meta.parent = dom.parseElement(target); // should be a generic function for parsing a 'target' argument that checks for string/DOM/jQUERY
	    this.meta.colors = {};
	
	    if (settings) {
	      this.meta.attribute = settings.attribute || "nexus-ui";
	      this.meta.title = settings.name || false;
	      this.meta.open = settings.open || false;
	    } else {
	      this.meta.attribute = "nexus-ui";
	      this.meta.title = false;
	      this.meta.open = false;
	    }
	
	    var defaultColors = colors(); // jshint ignore:line
	    this.meta.colors.accent = defaultColors.accent;
	    this.meta.colors.fill = defaultColors.fill;
	    this.meta.colors.light = defaultColors.light;
	    this.meta.colors.dark = defaultColors.dark;
	    this.meta.colors.mediumLight = defaultColors.mediumLight;
	    this.meta.colors.mediumDark = defaultColors.mediumDark;
	    this.buildInterface();
	    this.colorInterface();
	  }
	
	  _createClass(Rack, {
	    buildInterface: {
	      value: function buildInterface() {
	        var _this = this;
	
	        this.meta.parent.style.boxSizing = "border-box";
	        this.meta.parent.style.userSelect = "none";
	        this.meta.parent.style.mozUserSelect = "none";
	        this.meta.parent.style.webkitUserSelect = "none";
	
	        this.meta.contents = document.createElement("div");
	
	        while (this.meta.parent.childNodes.length > 0) {
	          this.meta.contents.appendChild(this.meta.parent.childNodes[0]);
	        }
	
	        this.meta.contents.style.padding = "0px";
	        this.meta.contents.style.boxSizing = "border-box";
	
	        if (this.meta.title) {
	          this.meta.titleBar = document.createElement("div");
	          this.meta.titleBar.innerHTML = this.meta.title;
	          this.meta.titleBar.style.fontFamily = "arial";
	          this.meta.titleBar.style.position = "relative";
	          this.meta.titleBar.style.color = "#888";
	          this.meta.titleBar.style.padding = "7px";
	          this.meta.titleBar.style.fontSize = "12px";
	
	          this.meta.button = document.createElement("div");
	          this.meta.button.style.position = "absolute";
	          this.meta.button.style.top = "5px";
	          this.meta.button.style.right = "5px";
	          this.meta.button.innerHTML = "-";
	          this.meta.button.style.padding = "0px 5px 2px";
	          this.meta.button.style.lineHeight = "12px";
	          this.meta.button.style.fontSize = "15px";
	
	          this.meta.button.style.cursor = "pointer";
	
	          this.meta.button.addEventListener("mouseover", function () {
	            _this.meta.button.style.backgroundColor = _this.meta.colors.mediumDark;
	          });
	          this.meta.button.addEventListener("mouseleave", function () {
	            _this.meta.button.style.backgroundColor = _this.meta.colors.mediumLight;
	          });
	          this.meta.button.addEventListener("click", function () {
	            if (_this.meta.open) {
	              _this.hide();
	            } else {
	              _this.show();
	            }
	          });
	
	          this.meta.titleBar.appendChild(this.meta.button);
	
	          this.meta.parent.appendChild(this.meta.titleBar);
	        }
	        this.meta.parent.appendChild(this.meta.contents);
	
	        //  var width = this.meta.parent.style.width = getComputedStyle(this.meta.parent).getPropertyValue('width');
	        //    this.meta.parent.style.width = width;
	
	        var ui = transform.section(this.meta.target, this.meta.attribute);
	        for (var key in ui) {
	          this[key] = ui[key];
	        }
	      }
	    },
	    colorInterface: {
	      value: function colorInterface() {
	        if (this.meta.title) {
	          this.meta.button.style.backgroundColor = this.meta.colors.mediumLight;
	          this.meta.button.style.border = "solid 0px " + this.meta.colors.fill;
	          this.meta.parent.style.border = "solid 1px " + this.meta.colors.mediumLight;
	          this.meta.parent.style.backgroundColor = this.meta.colors.light;
	          this.meta.titleBar.style.backgroundColor = this.meta.colors.fill;
	        }
	      }
	    },
	    show: {
	      value: function show() {
	        this.meta.contents.style.display = "block";
	        this.meta.open = true;
	      }
	    },
	    hide: {
	      value: function hide() {
	        this.meta.contents.style.display = "none";
	        this.meta.open = false;
	      }
	    },
	    colorize: {
	      value: function colorize(type, color) {
	        for (var key in this) {
	          if (this[key].colorize) {
	            this[key].colorize(type, color);
	          }
	        }
	        this.meta.colors[type] = color;
	        this.colorInterface();
	      }
	    },
	    empty: {
	      value: function empty() {
	        for (var key in this) {
	          if (this[key].destroy) {
	            this[key].destroy();
	          }
	        }
	      }
	    }
	  });
	
	  return Rack;
	})();
	
	module.exports = Rack;

/***/ }),
/* 39 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };
	
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	"use strict";
	
	var dom = _interopRequire(__webpack_require__(7));
	
	var Interfaces = _interopRequire(__webpack_require__(2));
	
	var createInterfaceID = function (widget, interfaceIDs) {
	  var type = widget.type;
	  if (interfaceIDs[type]) {
	    interfaceIDs[type]++;
	  } else {
	    interfaceIDs[type] = 1;
	  }
	  return type + interfaceIDs[type];
	};
	
	var element = function (element, type, options) {
	  options = options || {};
	  for (var i = 0; i < element.attributes.length; i++) {
	    var att = element.attributes[i];
	    //  try {
	    //    options[att.nodeName] = eval(att.nodeValue);
	    //  } catch(e) {
	    options[att.nodeName] = att.nodeValue;
	    //  }
	  }
	  type = type[0].toUpperCase() + type.slice(1);
	  var widget = new Interfaces[type](element, options);
	  widget.id = element.id;
	  return widget;
	};
	
	var section = function (parent, keyword) {
	
	  keyword = keyword || "nexus-ui";
	
	  var interfaceIDs = {};
	
	  var container = dom.parseElement(parent);
	
	  var ui = {};
	
	  var htmlElements = container.getElementsByTagName("*");
	  var elements = [];
	  for (var i = 0; i < htmlElements.length; i++) {
	    elements.push(htmlElements[i]);
	  }
	  for (var i = 0; i < elements.length; i++) {
	    var type = elements[i].getAttribute(keyword);
	    if (type) {
	      var formattedType = false;
	      for (var key in Interfaces) {
	        if (type.toLowerCase() === key.toLowerCase()) {
	          formattedType = key;
	        }
	      }
	      console.log(formattedType);
	      var widget = element(elements[i], formattedType);
	      if (widget.id) {
	        ui[widget.id] = widget;
	      } else {
	        var id = createInterfaceID(widget, interfaceIDs);
	        ui[id] = widget;
	      }
	    }
	  }
	
	  return ui;
	};
	
	var add = function (type, parent, options) {
	  var target = document.createElement("div");
	  options = options || {};
	  if (parent) {
	    parent = dom.parseElement(parent);
	  } else {
	    parent = document.body;
	  }
	  parent.appendChild(target);
	  options.target = target;
	  if (options.size) {
	    target.style.width = options.size[0] + "px";
	    target.style.height = options.size[1] + "px";
	  }
	  return element(target, type, options);
	};
	
	exports.element = element;
	exports.section = section;
	exports.add = add;

/***/ }),
/* 40 */
/***/ (function(module, exports, __webpack_require__) {

	"use strict";
	
	var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	var math = _interopRequire(__webpack_require__(5));
	
	var Tune = (function () {
	  function Tune() {
	    _classCallCheck(this, Tune);
	
	    // the scale as ratios
	    this.scale = [];
	
	    // i/o modes
	    this.mode = {
	      output: "frequency",
	      input: "step"
	    };
	
	    // ET major
	    this.etmajor = [261.62558, 293.664764, 329.627563, 349.228241, 391.995422, 440, 493.883301, 523.25116];
	
	    // Root frequency.
	    this.root = math.mtof(60); // * Math.pow(2,(60-69)/12);
	
	    // default is a major scale
	    this.createScale(0, 2, 4, 5, 7, 9, 11);
	  }
	
	  _createClass(Tune, {
	    note: {
	
	      /* Return data in the mode you are in (freq, ratio, or midi) */
	
	      value: function note(input, octave) {
	        var newvalue = undefined;
	
	        if (this.mode.output === "frequency") {
	          newvalue = this.frequency(input, octave);
	        } else if (this.mode.output === "ratio") {
	          newvalue = this.ratio(input, octave);
	        } else if (this.mode.output === "MIDI") {
	          newvalue = this.MIDI(input, octave);
	        } else {
	          newvalue = this.frequency(input, octave);
	        }
	
	        return newvalue;
	      }
	    },
	    frequency: {
	
	      /* Return freq data */
	
	      value: function frequency(stepIn, octaveIn) {
	        if (this.mode.input === "midi" || this.mode.input === "MIDI") {
	          this.stepIn += 60;
	        }
	
	        // what octave is our input
	        var octave = Math.floor(stepIn / this.scale.length);
	
	        if (octaveIn) {
	          octave += octaveIn;
	        }
	
	        // which scale degree (0 - scale length) is our input
	        var scaleDegree = stepIn % this.scale.length;
	
	        while (scaleDegree < 0) {
	          scaleDegree += this.scale.length;
	        }
	
	        var ratio = this.scale[scaleDegree];
	
	        var freq = this.root * ratio;
	
	        freq = freq * Math.pow(2, octave);
	
	        // truncate irrational numbers
	        freq = Math.floor(freq * 100000000000) / 100000000000;
	
	        return freq;
	      }
	    },
	    ratio: {
	
	      /* Force return ratio data */
	
	      value: function ratio(stepIn, octaveIn) {
	        if (this.mode.input === "midi" || this.mode.input === "MIDI") {
	          this.stepIn += 60;
	        }
	
	        // what octave is our input
	        var octave = Math.floor(stepIn / this.scale.length);
	
	        if (octaveIn) {
	          octave += octaveIn;
	        }
	
	        // which scale degree (0 - scale length) is our input
	        var scaleDegree = stepIn % this.scale.length;
	
	        // what ratio is our input to our key
	        var ratio = Math.pow(2, octave) * this.scale[scaleDegree];
	
	        ratio = Math.floor(ratio * 100000000000) / 100000000000;
	
	        return ratio;
	      }
	    },
	    MIDI: {
	
	      /* Force return adjusted MIDI data */
	
	      value: function MIDI(stepIn, octaveIn) {
	        var newvalue = this.frequency(stepIn, octaveIn);
	
	        var n = 69 + 12 * Math.log(newvalue / 440) / Math.log(2);
	
	        n = Math.floor(n * 1000000000) / 1000000000;
	
	        return n;
	      }
	    },
	    createScale: {
	      value: function createScale() {
	        var newScale = [];
	        for (var i = 0; i < arguments.length; i++) {
	          newScale.push(math.mtof(60 + arguments[i]));
	        }
	        this.loadScaleFromFrequencies(newScale);
	      }
	    },
	    createJIScale: {
	      value: function createJIScale() {
	        this.scale = [];
	        for (var i = 0; i < arguments.length; i++) {
	          this.scale.push(arguments[i]);
	        }
	      }
	    },
	    loadScaleFromFrequencies: {
	      value: function loadScaleFromFrequencies(freqs) {
	        this.scale = [];
	        for (var i = 0; i < freqs.length; i++) {
	          this.scale.push(freqs[i] / freqs[0]);
	        }
	      }
	    },
	    loadScale: {
	
	      /* Load a new scale */
	
	      value: function loadScale(name) {
	        /* load the scale */
	        var freqs = this.scales[name].frequencies;
	        this.loadScaleFromFrequencies(freqs);
	      }
	    },
	    search: {
	
	      /* Search the names of tunings
	      	 Returns an array of names of tunings */
	
	      value: function search(letters) {
	        var possible = [];
	        for (var key in this.scales) {
	          if (key.toLowerCase().indexOf(letters.toLowerCase()) !== -1) {
	            possible.push(key);
	          }
	        }
	        return possible;
	      }
	    },
	    chord: {
	
	      /* Return a collection of notes as an array */
	
	      value: function chord(midis) {
	        var output = [];
	        for (var i = 0; i < midis.length; i++) {
	          output.push(this.note(midis[i]));
	        }
	        return output;
	      }
	    }
	  });
	
	  return Tune;
	})();
	
	module.exports = Tune;

/***/ }),
/* 41 */
/***/ (function(module, exports) {

	"use strict";
	
	var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();
	
	var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };
	
	//Disable jshint warning concerning trailing regular params
	/*jshint -W138 */
	
	var Radio = (function () {
	    //if non-existent buttons are switched, they are ignored
	
	    function Radio() {
	        for (var _len = arguments.length, onVals = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
	            onVals[_key - 1] = arguments[_key];
	        }
	
	        var length = arguments[0] === undefined ? 3 : arguments[0];
	
	        _classCallCheck(this, Radio);
	
	        //each optional 'onVals' argument switches on that value in the Radio if it exists
	        //In the example below, a 3-button radio is created, index 0 is switched on, index 1 is switched on then then attempted again producing an warning, and the final argument produces a warning because the index value does not exist.
	        //Example:
	        //`  radio = new Radio(3, 0, 1, 1, 3);
	        //…  [1,1,0]
	
	        if (length < 0) {
	            length = 1;
	        }
	
	        this.length = length;
	        this.onVals = onVals;
	        this.array = new Array(length).fill(0);
	
	        if (onVals.length > 0) {
	            this.on.apply(this, onVals);
	        }
	    }
	
	    _createClass(Radio, {
	        select: {
	            value: function select(value) {
	                this.array.fill(0);
	                this.array[value] = 1;
	                return this.array;
	            }
	        },
	        flip: {
	            value: function flip() {
	                for (var _len = arguments.length, values = Array(_len), _key = 0; _key < _len; _key++) {
	                    values[_key] = arguments[_key];
	                }
	
	                //flips the specified values. if no value is specified, flips all buttons
	                var a = this.array;
	                if (values.length > 0) {
	                    values.forEach(function (v) {
	                        if (v > a.length - 1) {
	                            console.warn("Warning: AnonRadio[" + v + "] does not exist");
	                        } else {
	                            a[v] = a[v] ? 0 : 1;
	                        }
	                    });
	                } else {
	                    a.forEach(function (v, i, arr) {
	                        arr[i] = v ? 0 : 1;
	                    });
	                }
	                return a;
	            }
	        },
	        on: {
	            value: function on() {
	                for (var _len = arguments.length, values = Array(_len), _key = 0; _key < _len; _key++) {
	                    values[_key] = arguments[_key];
	                }
	
	                //switch on the specified values. if no value specified, flips on all buttons
	                var a = this.array;
	                if (values.length > 0) {
	                    values.forEach(function (v) {
	                        if (v > a.length - 1) {
	                            console.warn("Warning: AnonRadio[" + v + "] exceeds size of object");
	                        } else {
	                            if (a[v] === 1) {
	                                console.warn("Warning: AnonRadio[" + v + "] was already on.");
	                            }
	                            a[v] = 1;
	                        }
	                    });
	                } else {
	                    a.fill(1);
	                }
	                return a;
	            }
	        },
	        off: {
	            value: function off() {
	                for (var _len = arguments.length, values = Array(_len), _key = 0; _key < _len; _key++) {
	                    values[_key] = arguments[_key];
	                }
	
	                //switch off the specified values. if no value specified, flips off all buttons
	                var a = this.array;
	                if (values.length > 0) {
	                    values.forEach(function (v) {
	                        a[v] = 0;
	                    });
	                } else {
	                    a.fill(0);
	                }
	                return a;
	            }
	        }
	    });
	
	    return Radio;
	})();
	
	module.exports = Radio;

/***/ }),
/* 42 */
/***/ (function(module, exports, __webpack_require__) {

	var WAAClock = __webpack_require__(43)
	
	module.exports = WAAClock
	if (typeof window !== 'undefined') window.WAAClock = WAAClock


/***/ }),
/* 43 */
/***/ (function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(process) {var isBrowser = (typeof window !== 'undefined')
	
	var CLOCK_DEFAULTS = {
	  toleranceLate: 0.10,
	  toleranceEarly: 0.001
	}
	
	// ==================== Event ==================== //
	var Event = function(clock, deadline, func) {
	  this.clock = clock
	  this.func = func
	  this._cleared = false // Flag used to clear an event inside callback
	
	  this.toleranceLate = clock.toleranceLate
	  this.toleranceEarly = clock.toleranceEarly
	  this._latestTime = null
	  this._earliestTime = null
	  this.deadline = null
	  this.repeatTime = null
	
	  this.schedule(deadline)
	}
	
	// Unschedules the event
	Event.prototype.clear = function() {
	  this.clock._removeEvent(this)
	  this._cleared = true
	  return this
	}
	
	// Sets the event to repeat every `time` seconds.
	Event.prototype.repeat = function(time) {
	  if (time === 0)
	    throw new Error('delay cannot be 0')
	  this.repeatTime = time
	  if (!this.clock._hasEvent(this))
	    this.schedule(this.deadline + this.repeatTime)
	  return this
	}
	
	// Sets the time tolerance of the event.
	// The event will be executed in the interval `[deadline - early, deadline + late]`
	// If the clock fails to execute the event in time, the event will be dropped.
	Event.prototype.tolerance = function(values) {
	  if (typeof values.late === 'number')
	    this.toleranceLate = values.late
	  if (typeof values.early === 'number')
	    this.toleranceEarly = values.early
	  this._refreshEarlyLateDates()
	  if (this.clock._hasEvent(this)) {
	    this.clock._removeEvent(this)
	    this.clock._insertEvent(this)
	  }
	  return this
	}
	
	// Returns true if the event is repeated, false otherwise
	Event.prototype.isRepeated = function() { return this.repeatTime !== null }
	
	// Schedules the event to be ran before `deadline`.
	// If the time is within the event tolerance, we handle the event immediately.
	// If the event was already scheduled at a different time, it is rescheduled.
	Event.prototype.schedule = function(deadline) {
	  this._cleared = false
	  this.deadline = deadline
	  this._refreshEarlyLateDates()
	
	  if (this.clock.context.currentTime >= this._earliestTime) {
	    this._execute()
	  
	  } else if (this.clock._hasEvent(this)) {
	    this.clock._removeEvent(this)
	    this.clock._insertEvent(this)
	  
	  } else this.clock._insertEvent(this)
	}
	
	Event.prototype.timeStretch = function(tRef, ratio) {
	  if (this.isRepeated())
	    this.repeatTime = this.repeatTime * ratio
	
	  var deadline = tRef + ratio * (this.deadline - tRef)
	  // If the deadline is too close or past, and the event has a repeat,
	  // we calculate the next repeat possible in the stretched space.
	  if (this.isRepeated()) {
	    while (this.clock.context.currentTime >= deadline - this.toleranceEarly)
	      deadline += this.repeatTime
	  }
	  this.schedule(deadline)
	}
	
	// Executes the event
	Event.prototype._execute = function() {
	  if (this.clock._started === false) return
	  this.clock._removeEvent(this)
	
	  if (this.clock.context.currentTime < this._latestTime)
	    this.func(this)
	  else {
	    if (this.onexpired) this.onexpired(this)
	    console.warn('event expired')
	  }
	  // In the case `schedule` is called inside `func`, we need to avoid
	  // overrwriting with yet another `schedule`.
	  if (!this.clock._hasEvent(this) && this.isRepeated() && !this._cleared)
	    this.schedule(this.deadline + this.repeatTime) 
	}
	
	// Updates cached times
	Event.prototype._refreshEarlyLateDates = function() {
	  this._latestTime = this.deadline + this.toleranceLate
	  this._earliestTime = this.deadline - this.toleranceEarly
	}
	
	// ==================== WAAClock ==================== //
	var WAAClock = module.exports = function(context, opts) {
	  var self = this
	  opts = opts || {}
	  this.tickMethod = opts.tickMethod || 'ScriptProcessorNode'
	  this.toleranceEarly = opts.toleranceEarly || CLOCK_DEFAULTS.toleranceEarly
	  this.toleranceLate = opts.toleranceLate || CLOCK_DEFAULTS.toleranceLate
	  this.context = context
	  this._events = []
	  this._started = false
	}
	
	// ---------- Public API ---------- //
	// Schedules `func` to run after `delay` seconds.
	WAAClock.prototype.setTimeout = function(func, delay) {
	  return this._createEvent(func, this._absTime(delay))
	}
	
	// Schedules `func` to run before `deadline`.
	WAAClock.prototype.callbackAtTime = function(func, deadline) {
	  return this._createEvent(func, deadline)
	}
	
	// Stretches `deadline` and `repeat` of all scheduled `events` by `ratio`, keeping
	// their relative distance to `tRef`. In fact this is equivalent to changing the tempo.
	WAAClock.prototype.timeStretch = function(tRef, events, ratio) {
	  events.forEach(function(event) { event.timeStretch(tRef, ratio) })
	  return events
	}
	
	// Removes all scheduled events and starts the clock 
	WAAClock.prototype.start = function() {
	  if (this._started === false) {
	    var self = this
	    this._started = true
	    this._events = []
	
	    if (this.tickMethod === 'ScriptProcessorNode') {
	      var bufferSize = 256
	      // We have to keep a reference to the node to avoid garbage collection
	      this._clockNode = this.context.createScriptProcessor(bufferSize, 1, 1)
	      this._clockNode.connect(this.context.destination)
	      this._clockNode.onaudioprocess = function () {
	        process.nextTick(function() { self._tick() })
	      }
	    } else if (this.tickMethod === 'manual') null // _tick is called manually
	
	    else throw new Error('invalid tickMethod ' + this.tickMethod)
	  }
	}
	
	// Stops the clock
	WAAClock.prototype.stop = function() {
	  if (this._started === true) {
	    this._started = false
	    this._clockNode.disconnect()
	  }  
	}
	
	// ---------- Private ---------- //
	
	// This function is ran periodically, and at each tick it executes
	// events for which `currentTime` is included in their tolerance interval.
	WAAClock.prototype._tick = function() {
	  var event = this._events.shift()
	
	  while(event && event._earliestTime <= this.context.currentTime) {
	    event._execute()
	    event = this._events.shift()
	  }
	
	  // Put back the last event
	  if(event) this._events.unshift(event)
	}
	
	// Creates an event and insert it to the list
	WAAClock.prototype._createEvent = function(func, deadline) {
	  return new Event(this, deadline, func)
	}
	
	// Inserts an event to the list
	WAAClock.prototype._insertEvent = function(event) {
	  this._events.splice(this._indexByTime(event._earliestTime), 0, event)
	}
	
	// Removes an event from the list
	WAAClock.prototype._removeEvent = function(event) {
	  var ind = this._events.indexOf(event)
	  if (ind !== -1) this._events.splice(ind, 1)
	}
	
	// Returns true if `event` is in queue, false otherwise
	WAAClock.prototype._hasEvent = function(event) {
	 return this._events.indexOf(event) !== -1
	}
	
	// Returns the index of the first event whose deadline is >= to `deadline`
	WAAClock.prototype._indexByTime = function(deadline) {
	  // performs a binary search
	  var low = 0
	    , high = this._events.length
	    , mid
	  while (low < high) {
	    mid = Math.floor((low + high) / 2)
	    if (this._events[mid]._earliestTime < deadline)
	      low = mid + 1
	    else high = mid
	  }
	  return low
	}
	
	// Converts from relative time to absolute time
	WAAClock.prototype._absTime = function(relTime) {
	  return relTime + this.context.currentTime
	}
	
	// Converts from absolute time to relative time 
	WAAClock.prototype._relTime = function(absTime) {
	  return absTime - this.context.currentTime
	}
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(44)))

/***/ }),
/* 44 */
/***/ (function(module, exports) {

	// shim for using process in browser
	var process = module.exports = {};
	
	// cached from whatever global is present so that test runners that stub it
	// don't break things.  But we need to wrap it in a try catch in case it is
	// wrapped in strict mode code which doesn't define any globals.  It's inside a
	// function because try/catches deoptimize in certain engines.
	
	var cachedSetTimeout;
	var cachedClearTimeout;
	
	function defaultSetTimout() {
	    throw new Error('setTimeout has not been defined');
	}
	function defaultClearTimeout () {
	    throw new Error('clearTimeout has not been defined');
	}
	(function () {
	    try {
	        if (typeof setTimeout === 'function') {
	            cachedSetTimeout = setTimeout;
	        } else {
	            cachedSetTimeout = defaultSetTimout;
	        }
	    } catch (e) {
	        cachedSetTimeout = defaultSetTimout;
	    }
	    try {
	        if (typeof clearTimeout === 'function') {
	            cachedClearTimeout = clearTimeout;
	        } else {
	            cachedClearTimeout = defaultClearTimeout;
	        }
	    } catch (e) {
	        cachedClearTimeout = defaultClearTimeout;
	    }
	} ())
	function runTimeout(fun) {
	    if (cachedSetTimeout === setTimeout) {
	        //normal enviroments in sane situations
	        return setTimeout(fun, 0);
	    }
	    // if setTimeout wasn't available but was latter defined
	    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
	        cachedSetTimeout = setTimeout;
	        return setTimeout(fun, 0);
	    }
	    try {
	        // when when somebody has screwed with setTimeout but no I.E. maddness
	        return cachedSetTimeout(fun, 0);
	    } catch(e){
	        try {
	            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
	            return cachedSetTimeout.call(null, fun, 0);
	        } catch(e){
	            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
	            return cachedSetTimeout.call(this, fun, 0);
	        }
	    }
	
	
	}
	function runClearTimeout(marker) {
	    if (cachedClearTimeout === clearTimeout) {
	        //normal enviroments in sane situations
	        return clearTimeout(marker);
	    }
	    // if clearTimeout wasn't available but was latter defined
	    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
	        cachedClearTimeout = clearTimeout;
	        return clearTimeout(marker);
	    }
	    try {
	        // when when somebody has screwed with setTimeout but no I.E. maddness
	        return cachedClearTimeout(marker);
	    } catch (e){
	        try {
	            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
	            return cachedClearTimeout.call(null, marker);
	        } catch (e){
	            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
	            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
	            return cachedClearTimeout.call(this, marker);
	        }
	    }
	
	
	
	}
	var queue = [];
	var draining = false;
	var currentQueue;
	var queueIndex = -1;
	
	function cleanUpNextTick() {
	    if (!draining || !currentQueue) {
	        return;
	    }
	    draining = false;
	    if (currentQueue.length) {
	        queue = currentQueue.concat(queue);
	    } else {
	        queueIndex = -1;
	    }
	    if (queue.length) {
	        drainQueue();
	    }
	}
	
	function drainQueue() {
	    if (draining) {
	        return;
	    }
	    var timeout = runTimeout(cleanUpNextTick);
	    draining = true;
	
	    var len = queue.length;
	    while(len) {
	        currentQueue = queue;
	        queue = [];
	        while (++queueIndex < len) {
	            if (currentQueue) {
	                currentQueue[queueIndex].run();
	            }
	        }
	        queueIndex = -1;
	        len = queue.length;
	    }
	    currentQueue = null;
	    draining = false;
	    runClearTimeout(timeout);
	}
	
	process.nextTick = function (fun) {
	    var args = new Array(arguments.length - 1);
	    if (arguments.length > 1) {
	        for (var i = 1; i < arguments.length; i++) {
	            args[i - 1] = arguments[i];
	        }
	    }
	    queue.push(new Item(fun, args));
	    if (queue.length === 1 && !draining) {
	        runTimeout(drainQueue);
	    }
	};
	
	// v8 likes predictible objects
	function Item(fun, array) {
	    this.fun = fun;
	    this.array = array;
	}
	Item.prototype.run = function () {
	    this.fun.apply(null, this.array);
	};
	process.title = 'browser';
	process.browser = true;
	process.env = {};
	process.argv = [];
	process.version = ''; // empty string to avoid regexp issues
	process.versions = {};
	
	function noop() {}
	
	process.on = noop;
	process.addListener = noop;
	process.once = noop;
	process.off = noop;
	process.removeListener = noop;
	process.removeAllListeners = noop;
	process.emit = noop;
	process.prependListener = noop;
	process.prependOnceListener = noop;
	
	process.listeners = function (name) { return [] }
	
	process.binding = function (name) {
	    throw new Error('process.binding is not supported');
	};
	
	process.cwd = function () { return '/' };
	process.chdir = function (dir) {
	    throw new Error('process.chdir is not supported');
	};
	process.umask = function() { return 0; };


/***/ })
/******/ ])
});
;

},{}]},{},[1]);
