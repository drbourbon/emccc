const p = require("@tonaljs/pcset")
const c = require("@tonaljs/chord")
const m = require("@tonaljs/midi")
const WebMidi = require("webmidi");

var device = null;
var emc_channel = 0;
var last_emc_note = 0;

function sendShapeColor(note, shape, color, channel) {
//    console.log(`Sending Note:${note}, Shape:${shape}, Color:${color} on Channel ${channel}`);
    last_emc_note = note;
//    device.sendControlChange(17,shape).sendControlChange(16,color).playNote(note, channel);
    device.playNote(note, channel).sendControlChange(17,shape).sendControlChange(16,color);
}

function sendOff(channel) {
    if(last_emc_note)
        device.stopNote(last_emc_note, channel)
}

function enableWebMidi() {
    WebMidi.enable(function (err) {
        if (err) {
            console.log('Browser not compatible');
            $('#not_compatible_message').show();
            $('#device_status').css('color', 'red');
            $('#connection-info').hide();
            $('.device-connected').hide();
            return;
        }
    
        WebMidi.addListener('connected', function (event) {
            handleConnection(event, true);
        });
        WebMidi.addListener('disconnected', function (event) {
            handleConnection(event, false);
        });
        onDisconnect();
    }, sysex=false);    
}

function isModelCycles(s){
    return s.name == 'Elektron Model:Cycles'
}

function handleConnection(event, state) {
//    console.log("MIDI connection event: " + state + ". Payload[" + JSON.stringify(event) + "]");
    
    if(state===true){
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

    } else {
        onDisconnect();
    }
}

function isConnected() {
    return device && device.enabled // && device.sysexEnabled;
}


var current_notes = new Array(127).fill(false);
var connection_complete = false
function onConnect() {
    $('#unconnected_message').hide();
    $('#device_status').css('color', 'green');
    $('#connection-info').show();
    
    $('.device-connected').show();
    $('.device-disconnected').hide();

    $('.device-enabled').removeClass('disabled');
    $('.device-disabled').addClass('disabled');
    
    var input = null;
    for (var i = 0; i < WebMidi.inputs.length; i++) {
//        console.log('Input', WebMidi.inputs[i].name, WebMidi.outputs[i]);
        if (!isModelCycles(WebMidi.outputs[i])) {
            input = WebMidi.inputs[i];
            input.removeListener();
            input.addListener('noteon', "all", function (event) {
                //console.log(event.note);
                current_notes[event.note.number] = true;
                playedChord(true);
            })
            input.addListener('noteoff', "all", function (event) {
                //console.log(event.note);
                current_notes[event.note.number] = false;
                playedChord(false);
                if(emc_channel)
                    sendOff();
            })            
        }
    }

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
        for(var i=0; i<current_notes.length; i++){
            if(current_notes[i]){
                chord.push(m.midiToNoteName(i, { sharps: true }));
            }
        }
        const name = c.detect(chord);
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

                tonica = tonica.slice(0,-1) + (parseInt(tonica.slice(-1))+1) // trick

                if(emc_channel && shape && color && tonicaCode){
                    sendShapeColor(tonicaCode, shape-1, color-1, emc_channel);
                    $(document).trigger('emccc:chord',[ cname, {
                        "chord":cname,
                        "shape":shape,
                        "color":color,
                        "tonica":tonica,
                        "chord":chord
                    } ]);
                    return;
                }
            }

            $(document).trigger('emccc:chord',[ base, ""+rivolto, chord ]);
            return;
        }
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
  "7b13":24
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
• m9no5
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
