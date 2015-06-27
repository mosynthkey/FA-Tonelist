var midiAccess = null;
var inputs = new Array();
var input = null;
var outputs = new Array();
var output = null;
var input_device = 0;
var output_device = 0;
var midi_ch = 1;
var msb = 0;
var lsb = 0;
var isFA = false;

var device_id = 0x10;

var SysEx_queue = new Array();
var SysEx_tmr = null;

var r_all_tmr = null;

// 機器から取得したデータ及び機器に転送するデータ
var studio_set_common_data = new Array(0x5d);
var sn_synth_tone_common_data = new Array(0x32);
var sn_synth_tone_partial_data = new Array(0x03);
sn_synth_tone_partial_data[0] = new Array(0x3d);
sn_synth_tone_partial_data[1] = new Array(0x3d);
sn_synth_tone_partial_data[2] = new Array(0x3d);

var name_addr = new Array();
name_addr["osc_type"] = 0x00;
name_addr["osc_var"] = 0x01;
name_addr["osc_ssaw_detune"] = 0x3a;
name_addr["osc_var"] = 0x01;
name_addr["filter_cutoff"] = 0x0c;
name_addr["filter_res"] = 0x0f;
name_addr["filter_A"] = 0x10;
name_addr["filter_D"] = 0x11;
name_addr["filter_S"] = 0x12;
name_addr["filter_R"] = 0x13;
name_addr["filter_depth"] = 0x14;
name_addr["amp_pan"] = 0x1b;
name_addr["amp_level"] = 0x15;
name_addr["amp_A"] = 0x17;
name_addr["amp_D"] = 0x18;
name_addr["amp_S"] = 0x19;
name_addr["amp_R"] = 0x1a;

// 汎用
String.prototype.rtrim = function() {
	return this.replace(/\s+$/, "");
}

function StringFromCharCodeArray()
{
	var res = "";
	var n = 0;
	if (arguments.length == 1) {
		n = (arguments[0]).length;
	} else if (arguments.length == 2) {
		n = parseInt(arguments[1]);
	}
	for (var i = 0; i < n; i++) {
		res += String.fromCharCode((arguments[0])[i]);
	}
	
	return res;
}

function aryncmp(a, b, n)
{
	// ２つの配列aとbを先頭からnまで比較する
	if (n > a.length || n > b.length) return false;
	
	for (var i = 0; i <= n; i++) {
		if (a[i] != b[i]) return false;
	}
	
	return true;
}

function initMIDI()
{
	navigator.requestMIDIAccess( { sysex: true } ).then((function(midi) {
		// MIDIデバイスが使用可能
		midiAccess = midi;
		if (midiAccess != null) {
			if (typeof midiAccess.inputs == 'function') {
			// For Old Chrome
				inputs = midiAccess.inputs();
				outputs = midiAccess.outputs();
			} else {
			// For New Chrome
				var it = midiAccess.inputs.values();
				for (var o = it.next(); !o.done; o = it.next()) {
					inputs.push(o.value);
				}
				var it = midiAccess.outputs.values();
				for (var o = it.next(); !o.done; o = it.next()) {
					outputs.push(o.value);
				}
			}

			var opts = $("#midiout_select").html();
			if(outputs.length > 0){
				for (var i = 0; i < outputs.length; i++) {
					opts += ('<option value=' + i + '>' + outputs[i].name + '</option>');
				}
			}
			$("#midiout_select").html(opts);

			opts = $("#midiin_select").html();
			if(inputs.length > 0){
				for (var i = 0; i < inputs.length; i++) {
					opts += ('<option value=' + i + '>' + inputs[i].name + '</option>');
				}
			}
			$("#midiin_select").html(opts);
		}
	}), (function() {
		alert( "MIDIが使えません。" );
	}));
}

function onMidiOutChange(item)
{
	output_device = document.getElementById("midiout_select").value;
	output = outputs[output_device];
	isFA = false;
	document.getElementById("FA-06_detected").style.display = 'none';
    document.getElementById("FA-08_detected").style.display = 'none';
	document.getElementById("no_fa_detected").style.display = 'block';
	sendIdentityRequestMessage();
}

function onMidiInChange(item)
{
	input_device = document.getElementById("midiin_select").value;
	input = inputs[input_device];
	isFA = false;
	input.onmidimessage = onMIDIMessage;
	document.getElementById("FA-06_detected").style.display = 'none';
    document.getElementById("FA-08_detected").style.display = 'none';
	document.getElementById("no_fa_detected").style.display = 'block';
	sendIdentityRequestMessage();
}

function onMidiChannelSelectChange(item)
{
	midi_ch = parseInt(document.getElementById("midi_channel_select").value);
	console.log(midi_ch);
	recieveAll();
}

function onMIDIMessage(event)
{
	// 送られてきたデータの処理を行う
	var e_data = event.data;
	var str = "";
	var dt1 = [0xf0, 0x41, device_id, 0x00, 0x00, 0x77, 0x12];
	var dt1_studio_set_common = [0x18, 0x00, 0x00, 0x00];
	var irm_fa06 = [0xf0, 0x7e, device_id, 0x06, 0x02, 0x41, 0x77, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf7];
	var irm_fa08 = [0xf0, 0x7e, device_id, 0x06, 0x02, 0x41, 0x77, 0x02, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0xf7];

	if (e_data[0] == 0xfe) {
		return;
		
	} else if (aryncmp(e_data, irm_fa06, 15) || aryncmp(e_data, irm_fa08, 15)) {
		if (e_data[10] == 0x00) {
			document.getElementById("FA-06_detected").style.display = 'block';
		} else if (e_data[10] == 0x01) {
			document.getElementById("FA-08_detected").style.display = 'block';
		}
		document.getElementById("no_fa_detected").style.display = 'none';
		isFA = true;
		recieveAll();

	} else if ((e_data[0] & 0xf0) == 0xB0) {
		if (e_data[1] == 0x20) {
			lsb = e_data[2];
		} else if (e_data[1] == 0x00) {
			msb = e_data[2];
		}

	} else if ((e_data[0] & 0xf0) == 0xC0) {
		// プログラムチェンジがかかったのですべての情報を更新する
		console.log(msb);
		if (msb == 85) {
			recieveAll();
		} else {
			sendRQ1([0x18, 0x00, (e_data[0] & 0x0f) + 0x20, 0x00], [0x00, 0x00, 0x00, 0x3d]);
		}

		
	} else if (aryncmp(e_data, dt1, 6)) {
		// DT1
		var addr = (e_data[7] << 24) | (e_data[8] << 16) | (e_data[9] << 8) | e_data[10];
		if (addr == 0x18000000) {
			// Studio Set Commonあたりの変更
			for (var i = 11; i < e_data.length - 2; i++) {
				studio_set_common_data[i - 11] = e_data[i];
			}
			
			// 入力ボックスのStudioSet名を更新する
			$("#studio_set_name").text(StringFromCharCodeArray(studio_set_common_data, 16).rtrim());

		} else if (0x18002000 <= addr && addr <= 0x18002f00) {
			// Studio Set Partあたりの変更
			var part = (e_data[9] - 0x20) + 1;
			var tone_type = getToneType(e_data[11 + 0x06], e_data[11 + 0x07]);
			$('#part' + part + '_cc00').text(e_data[11 + 0x06].toString());
			$('#part' + part + '_cc32').text(e_data[11 + 0x07].toString());
			$('#part' + part + '_pc').text((e_data[11 + 0x08] + 1).toString());
			$('#part' + part + '_volume').text(e_data[11 + 0x09].toString());
			$('#part' + part + '_chorus').text(e_data[11 + 0x2b].toString());
			$('#part' + part + '_reverb').text(e_data[11 + 0x2c].toString());
			$('#part' + part + '_type').text(tone_type.toString());

			var offset = 0;
			if (tone_type[1] == "SN-A") {
				offset = 0x02;
			} else if (tone_type[1] == "SN-S") {
				offset = 0x01;
			} else if (tone_type[1] == "SN-D") {
				offset = 0x03;
			} else if (tone_type[1] == "PCMD") {
				offset = 0x10;
			} else if (tone_type[1] == "PCMS") {
				offset = 0x00;
			}
			sendRQ1([0x19 + ((part - 1) >> 2), ((((part - 1) & 0x03) * 2) << 0x04) + offset, 0x00, 0x00], [0x00, 0x00, 0x00, 0x40]);
				
		} else if (0x19000000 <= addr) {
			var part = ((e_data[7] - 0x19) << 2) + (e_data[8] >> 0x05) + 1;
			var type = e_data[8] & 0x03;
			var tone_name = new Array(12);

			for (var i = 11; i < 11 + 12; i++) tone_name[i - 11] = e_data[i];
			$("#part" + part + "_name").text(StringFromCharCodeArray(tone_name));
		}
	}

	// logに書き込む
	if(e_data.length > 1) {
		str += "length = 0x" + e_data.length.toString(16) + " : 0x" + e_data[0].toString(16) + " ";

		for(var i = 1; i < e_data.length; i++) {
			str += "0x" + e_data[i].toString(16) + " ";
		}
	}
	console.log(str + "\n");
}

function getCheckSum(addr_data_arry)
{
	var sum = addr_data_arry.reduce(function(a, b) {return a + b;});
	return (128 - (sum % 128)) & 0x7f;
}

function sendSyeEx()
{
	if (SysEx_queue.length != 0) {
		output.send(SysEx_queue.shift());
	} else {
		clearInterval(SysEx_tmr);
		SysEx_tmr = null;
	}
}


function sendDT1(addr_ary, data_ary)
{
	var dt1_head = [0xf0, 0x41, device_id, 0x00, 0x00, 0x77, 0x12];
	var dt1_addr_data = addr_ary.concat(data_ary);
	var dt1_tail = [0x00/*チェックサム*/, 0xf7];
	dt1_tail[0] = getCheckSum(dt1_addr_data);
	if (isFA) {
		SysEx_queue.push(dt1_head.concat(dt1_addr_data, dt1_tail));
		if (SysEx_tmr == null) SysEx_tmr = setInterval(sendSyeEx, 30);
	}
}

function sendRQ1(addr_ary, size_ary)
{
	var rq1_head = [0xf0, 0x41, device_id, 0x00, 0x00, 0x77, 0x11];
	var rq1_addr_size = addr_ary.concat(size_ary);
	var rq1_tail = [0x00/*チェックサム*/, 0xf7];
	rq1_tail[0] = getCheckSum(rq1_addr_size);

	if (isFA) {
		SysEx_queue.push(rq1_head.concat(rq1_addr_size, rq1_tail));
		if (SysEx_tmr == null) SysEx_tmr = setInterval(sendSyeEx, 30);
	}
}

function getFormattedName(name_strings, len)
{
	
	var name_array = new Array(len);
	
	for (var i = 0; i < len; i++) {
		name_array[i] = 0x20;
	}
	for (var i = 0; i < name_strings.length; i++) {
		name_array[i] = name_strings.charCodeAt(i);
	}
	return name_array;
}

function onStudioSetNameChange(item)
{
	// StudioSetの名前が変更されたので新しい名前を送信する
	sendDT1([0x18, 0x00, 0x00, 0x00], getFormattedName(document.getElementById('studio_set_name').value, 16));
}

function sendIdentityRequestMessage()
{
	if (output != null) output.send([0xf0, 0x7e, device_id, 0x06, 0x01, 0xf7]);
}

function recieveAll()
{
	// FAからすべての情報を読み込む(ようにRQ1を送信する)
	SysEx_queue.length = 0;

	if (r_all_tmr != null) {
		clearInterval(r_all_tmr);
		r_all_tmr = null;
	}

	// 連続更新を防ぐため、タイマーで制御する
	r_all_tmr = setInterval(function() {
		// Studio Set Common
		sendRQ1([0x18, 0x00, 0x00, 0x00], [0x00, 0x00, 0x00, 0x5d]);
			// Studio Set 
		for (var i = 0x20; i <= 0x2f; i++) {
			sendRQ1([0x18, 0x00, i, 0x00], [0x00, 0x00, 0x00, 0x3d]);
		}

		clearInterval(r_all_tmr);
		r_all_tmr = null;
	}, 500);
}

function test()
{
	for (var i = 0x2a; i <= 0x2f; i++) {
		sendRQ1([0x18, 0x00, i, 0x00], [0x00, 0x00, 0x00, 0x3d]);
	}
}
function onSnsPartialChange(item, name)
{
	// 変更が加えられたのでシンセに変更を適応する
	
	var common_addr = [0x19 + ((midi_ch - 1) >> 2), ((((midi_ch - 1) & 0x03) * 2) << 0x04) + 0x01];
	var partial_addr = [0x19 + ((midi_ch - 1) >> 2), ((((midi_ch - 1) & 0x03) * 2) << 0x04) + 0x01, 0x20];
	if (name == "common") {
		// Commonの設定変更
		
		// 名前
		sendDT1([0x19 + ((midi_ch - 1) >> 2), ((((midi_ch - 1) & 0x03) * 2) << 0x04) + 0x01, 0x00, 0x00], getFormattedName(document.getElementById('tone_name').value, 12));
		// MONO POLY変更
		sendDT1(common_addr.concat([0x00, 0x14]), [document.getElementById("sns_c_polymono").value]);
		
		// PartialのONOFF
		var onoff;
		for (var i = 1; i <= 3; i++) {
			onoff = 0
			if (document.getElementById("sns_" + i + "_partial_onoff").checked == true) {
				onoff = 1;
			}
			sendDT1(common_addr.concat([0x00, 0x19 + (i - 1) * 2]), [onoff]);
		}
		
	} else {
        // Partialの設定変更
        partial_addr[2] += (name.charCodeAt(4) - "1".charCodeAt(0));

        for (var key in name_addr) {
            sendDT1(partial_addr.concat([name_addr[key]]), parseInt([document.getElementById(name + key).value]));
        }
	
        var pcmnum = parseInt(document.getElementById(name + "osc_pcm_wavenumber").value);
        var pcmnum_ary = [(pcmnum & 0xf000) >> 12, (pcmnum & 0x0f00) >> 8, (pcmnum & 0x0f0) >> 4, (pcmnum & 0x00f)];
        console.log(pcmnum_ary.toString(16));
        sendDT1(partial_addr.concat([0x35]), pcmnum_ary);
	}
}

function getToneType(msb, lsb)
{
	if (msb == 89) {
		if (lsb == 0) {
			return ["USER", "SN-A"];
		} else if (lsb == 64) {
			return ["PRST", "SN-A"];
		}
	} else if (msb == 95) {
		if (0 <= lsb && lsb <= 3) {
			return ["USER", "SN-S"];
		} else if (64 <= lsb && lsb <= 74) {
			return ["PRST", "SN-S"];
		} 
	} else if (msb == 88) {
		if (lsb == 0) {
			return ["USER", "SN-D"];
		} else if (lsb == 64) {
			return ["PRST", "SN-D"];
		}
	} else if (msb == 87) {
		if (0 <= lsb && lsb <= 1) {
			return ["USER", "PCMS"];
		} else if (64 <= lsb && lsb <= 71) {
			return ["PRST", "PCMS"];
		}
	} else if (msb == 121) {
		if (lsb == 0) {
			return ["GM2", "PCMD"];
		}
	} else if (msb == 86) {
		if (lsb == 0) {
			return ["USER", "PCMD"];
		} else if (lsb == 64) {
			return ["PRST", "PCMD"];
		}
	} else if (msb == 120) {
		if (lsb == 0) {
			return ["GM2", "PCMD"];
		}
	} else if (msb == 93) {
		return ["EX  ", "PCMS"];
	} else if (msb == 92) {
		return ["EX  ", "PCMD"];
	}
}

