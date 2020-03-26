//const p = require("@tonaljs/pcset")
const c = require("@tonaljs/chord")
const m = require("@tonaljs/midi")
const { Interval } = require("@tonaljs/tonal");
const WebMidi = require("webmidi");

var device = null;
var emc_channel = 0;
var last_emc_note = 0;
var last_emc_shape = 0;
var last_emc_color = 0;
var offline_mode = false;

function sendShapeColor(note, shape, color, velocity, channel) {
    console.log(`Sending Note:${note}, Shape:${shape}, Color:${color}, Velocity:${velocity} on Channel ${channel}`);
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
            console.log(`Sending Note Off:${last_emc_note}`);
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
                /*
                current_notes[event.note.number] = true;
                current_notes_velocity[event.note.number] = event.velocity;
                playedChord(true);
                */
            })
            input.addListener('noteoff', "all", function (event) {
                stopNote(event.note.number);
                /*
                current_notes[event.note.number] = false;
                current_notes_velocity[event.note.number] = 0;
                playedChord(false);
                */
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

function playedChord(send) {
    const n = current_notes.filter(Boolean).length ;

    var chord = [];
    var velocity = 0;
    for(var i=0; i<current_notes.length; i++){
        if(current_notes[i]){
            if(velocity==0) velocity = current_notes_velocity[i];
            chord.push(m.midiToNoteName(i, { sharps: true }));
        }
    }
//        console.log(chord);

    if(n>2){
        const name = c.detect(chord);
//        console.log(name);
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
                    if(!offline_mode)
                        sendShapeColor(tonicaCode, shape-1, color, velocity, emc_channel);
                    $(document).trigger('emccc:chord',[ cname, {
                        "chord":cname,
                        "shape":shape,
                        "color":color,
                        "tonica":tonicaToString(tonica),
                        "notes":chord
                    } ]);
                    return;
                }
            }

            if(offline_mode)
                $(document).trigger('emccc:chord',[ cname, { "chord":cname, "notes":chord } ]);
            return;
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
                    "notes":chord
                } ]);
                return;
            }
        }
        //(document).trigger('emccc:chord',[ cname, { "chord":cname, "notes":[ note ] } ]);
        return;
    } else if (n==2) {
        var interval = Interval.distance(chord[0],chord[1]);
        interval = Interval.simplify(interval);
        const semitones = Interval.semitones(interval);
        console.log(chord);
        // custom Elektron rules
        var color, shape, tonica;
        switch(semitones){
            case 3: color = 10; shape = 4; tonica=tonicaToString(chord[0]); break; // minor third from m
            case 4: color = 10; shape = 5; tonica=tonicaToString(chord[0]); break; // major third from M
            default: color = 0; shape = 1; tonica=null; break; // revert to single note on boh
        }
        const cname = soloNota(chord[0]) + "-" + soloNota(chord[1]);
        if(offline_mode){
            $(document).trigger('emccc:chord',[ cname, {
                "chord":cname,
                "shape":shape,
                "color":color,
                "tonica":tonica,
                "notes":chord
            } ]);
        }
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
