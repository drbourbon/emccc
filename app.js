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
    const n = current_notes.filter(Boolean).length ;

    var chord = [];
    var velocity = 0;
    for(var i=0; i<current_notes.length; i++){
        if(current_notes[i]){
            if(velocity==0) velocity = current_notes_velocity[i];
            chord.push(m.midiToNoteName(i, { sharps: true }));
        }
    }
//    console.log(current_notes.filter(Boolean));
//    console.log(chord);

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
