// We make use of this 'server' variable to provide the address of the
// REST Janus API. By default, in this example we assume that Janus is
// co-located with the web server hosting the HTML pages but listening
// on a different port (8088, the default for HTTP in Janus), which is
// why we make use of the 'window.location.hostname' base address. Since
// Janus can also do HTTPS, and considering we don't really want to make
// use of HTTP for Janus if your demos are served on HTTPS, we also rely
// on the 'window.location.protocol' prefix to build the variable, in
// particular to also change the port used to contact Janus (8088 for
// HTTP and 8089 for HTTPS, if enabled).
// In case you place Janus behind an Apache frontend (as we did on the
// online demos at http://janus.conf.meetecho.com) you can just use a
// relative path for the variable, e.g.:
//
// 		var server = "/janus";
//
// which will take care of this on its own.
//
//
// If you want to use the WebSockets frontend to Janus, instead, you'll
// have to pass a different kind of address, e.g.:
//
// 		var server = "ws://" + window.location.hostname + ":8188";
//
// Of course this assumes that support for WebSockets has been built in
// when compiling the gateway. WebSockets support has not been tested
// as much as the REST API, so handle with care!
//
//
// If you have multiple options available, and want to let the library
// autodetect the best way to contact your gateway (or pool of gateways),
// you can also pass an array of servers, e.g., to provide alternative
// means of access (e.g., try WebSockets first and, if that fails, fall
// back to plain HTTP) or just have failover servers:
//
//		var server = [
//			"ws://" + window.location.hostname + ":8188",
//			"/janus"
//		];
//
// This will tell the library to try connecting to each of the servers
// in the presented order. The first working server will be used for
// the whole session.
//
var server = [
	"wss://" + window.location.hostname + ":8989",
	"https://" + window.location.hostname + ":8089/janus"
];

var janus = null;
var videocall = null;
var opaqueId = "videocalltest-"+Janus.randomString(12);

var STATUS = {
	INITIAL: 1,
	STARTED: 2,
	WAITING: 3,
	INCOMING: 4,
	TAKING: 5,
};
var status = STATUS.INITIAL;
var bitrateTimer = null;
var spinner = null;

var audioenabled = false;
var videoenabled = false;

var myusername = null;
var yourusername = null;

document.addEventListener("DOMContentLoaded", function () {
	if (!Notification) {
		bootbox.alert("Desktop notifications not available in your browser. Try Chrome.");
		return;
	}

	if (Notification.permission !== "granted") {
		Notification.requestPermission().then((permission) => {
			if (permission === "granted") {
				console.log("notify permission: granted");
			} else if (permission === "denied") {
				console.log("notify permission: denied");
			} else if (permission === "default") {
				console.log("notify permission: default");
			}
		});
	}
});

var notify = null;
function notifyMe(title, message, icon) {
	if (Notification.permission !== "granted") {
		Notification.requestPermission();
		return null;
	} else {
		var n = new Notification(title, {
			icon: icon,
			body: message,
		});
		n.onclick = () => {
			window.focus();
			n.close();
		};
		return n;
	}
}

$(document).on("click", "#registered-users > span", function () {
	$("#peer").val($(this).text());
});

$(document).ready(function() {
	// Initialize the library (console debug enabled)
	Janus.init({debug: (debug === "true"), callback: function() {
		// Use a button to start the demo
		$('#start').click(function() {
			if(status >= STATUS.STARTED)
				return;
			status = STATUS.STARTED;
			$(this).attr('disabled', true).unbind('click');
			// Make sure the browser supports WebRTC
			if(!Janus.isWebrtcSupported()) {
				bootbox.alert("No WebRTC support... ");
				return;
			}
			// Create session
			janus = new Janus(
				{
					server: server,
					success: function() {
						// Attach to videocall test plugin
						janus.attach(
							{
								plugin: "janus.plugin.videocall",
								opaqueId: opaqueId,
								success: function(pluginHandle) {
									$('#details').remove();
									videocall = pluginHandle;
									Janus.log("Plugin attached! (" + videocall.getPlugin() + ", id=" + videocall.getId() + ")");
									// Prepare the username registration
									$('#videocall').removeClass('hidden').show();
									$('#login').removeClass('hidden').show();
									$('#registernow').removeClass('hidden').show();
									$('#register').click(registerUsername);
									$('#username').focus();
									$('#start').removeAttr('disabled').html(_("Stop"))
										.click(function() {
											$(this).attr('disabled', true);
											doHangup();
											janus.destroy();
										});
								},
								error: function(error) {
									Janus.error("  -- Error attaching plugin...", error);
									bootbox.alert("  -- Error attaching plugin... " + error);
								},
								consentDialog: function(on) {
									Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
									if(on) {
										// Darken screen and show hint
										$.blockUI({ 
											message: '<div><img src="' + location.pathname + '/../../chrome/janus/img/up_arrow.png"/></div>',
											css: {
												border: 'none',
												padding: '15px',
												backgroundColor: 'transparent',
												color: '#aaa',
												top: '10px',
												left: (navigator.mozGetUserMedia ? '-100px' : '300px')
											} });
									} else {
										// Restore screen
										$.unblockUI();
									}
								},
								mediaState: function(medium, on) {
									Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
								},
								webrtcState: function(on) {
									Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
									$("#videoleft").parent().unblock();
								},
								onmessage: function(msg, jsep) {
									Janus.debug(" ::: Got a message :::");
									Janus.debug(JSON.stringify(msg));
									var result = msg["result"];
									if(result !== null && result !== undefined) {
										if(result["list"] !== undefined && result["list"] !== null) {
											var list = result["list"];
											Janus.debug("Got a list of registered peers:");
											Janus.debug(list);
											for(var mp in list) {
												Janus.debug("  >> [" + list[mp] + "]");
											}
											list.some((v, i) => {
												if (v == myusername) {
													list.splice(i, 1);
													return true;
												}
											});
											users = '';
											$.each(list, function () {
												users += `<span class="callto">${this}</span>`;
											});
											$("#registered-users").empty().append(users);
										} else if(result["event"] !== undefined && result["event"] !== null) {
											var event = result["event"];
											if(event === 'registered') {
												myusername = result["username"];
												Janus.log("Successfully registered as " + myusername + "!");
												$('#youok').removeClass('hidden').show().html(_("Registered as '{0}'").format(myusername));
												// Get a list of available peers, just for fun
												videocall.send({"message": { "request": "list" }});
												setInterval(function () {
													videocall.send({"message": { "request": "list" }});
												}, 10000);
												// TODO Enable buttons to call now
												$('#phone').removeClass('hidden').show();
												$('#call').unbind('click').click(doCall);
												$('#peer').focus();
												status = STATUS.WAITING;
											} else if(event === 'calling') {
												Janus.log("Waiting for the peer to answer...");
												// TODO Any ringtone?
												bootbox.alert("Waiting for the peer to answer...");
												$('#call').removeAttr('disabled').html(_('Hangup'))
													.removeClass("button-success").addClass("button-error")
													.unbind('click').click(doHangup);
											} else if(event === 'incomingcall') {
												Janus.log("Incoming call from " + result["username"] + "!");
												yourusername = result["username"];
												// Notify user
												notify = notifyMe("Incoming call",
												                  "Incoming call from " + yourusername + "!",
												                  avatar_url + yourusername);
												$('#snd-incoming').get(0).play();
												bootbox.hideAll();
												var message = "Incoming call from " + yourusername + "!";
												if (result["comment"]) {
													var comment = result["comment"];
													message += "<br>comment: <strong>" + $("<span/>").text(comment).html() + "</strong>";
													$("#comment").val(comment);
												}
												var incoming = bootbox.dialog({
													message: message,
													title: "Incoming call",
													closeButton: false,
													buttons: {
														success: {
															text: "Answer",
															btnClass: "btn-green",
															action: function() {
																incoming = null;
																if (notify !== null) {
																	notify.close();
																	notify = null;
																}
																$('#snd-incoming').get(0).pause();
																$('#peer').val(result["username"]).attr('disabled', true);
																videocall.createAnswer(
																	{
																		jsep: jsep,
																		// No media provided: by default, it's sendrecv for audio and video
																		media: { data: true },	// Let's negotiate data channels as well
																		success: function(jsep) {
																			Janus.debug("Got SDP!");
																			Janus.debug(jsep);
																			var body = { "request": "accept" };
																			videocall.send({"message": body, "jsep": jsep});
																			$('#peer').attr('disabled', true);
																			$('#call').removeAttr('disabled').html(_('Hangup'))
																				.removeClass("button-success").addClass("button-error")
																				.unbind('click').click(doHangup);
																		},
																		error: function(error) {
																			Janus.error("WebRTC error:", error);
																			bootbox.alert("WebRTC error... " + JSON.stringify(error));
																		}
																	});
															}
														},
														danger: {
															text: "Decline",
															btnClass: "btn-red",
															action: function() {
																incoming = null;
																status = STATUS.WAITING;
																doHangup();
															}
														}
													}
												});
												status = STATUS.INCOMING;
											} else if(event === 'accepted') {
												bootbox.hideAll();
												var peer = result["username"];
												if(peer === null || peer === undefined) {
													Janus.log("Call started!");
												} else {
													Janus.log(peer + " accepted the call!");
													yourusername = peer;
												}
												// Video call can start
												if(jsep)
													videocall.handleRemoteJsep({jsep: jsep});
												status = STATUS.TAKING;
											} else if(event === 'hangup') {
												Janus.log("Call hung up by " + result["username"] + " (" + result["reason"] + ")!");
												if (status == STATUS.INCOMING) {
													missedCallNotify();
												}
												// Reset status
												if (notify !== null) {
													notify.close();
													notify = null;
												}
												$('#snd-incoming').get(0).pause();
												bootbox.hideAll();
												videocall.hangup();
												if(spinner !== null && spinner !== undefined) {
													spinner.stop();
												}
												$('#comment').val('');
												$('#waitingvideo').remove();
												$('#videos').hide();
												$('#peer').removeAttr('disabled').val('');
												$('#call').removeAttr('disabled').html(_('Call'))
													.removeClass("button-error").addClass("button-success")
													.unbind('click').click(doCall);
												$('#toggleaudio').attr('disabled', true);
												$('#togglevideo').attr('disabled', true);
												$('#bitrate').attr('disabled', true);
												$('#curbitrate').hide();
												$('#curres').hide();
												status = STATUS.WAITING;
											}
										}
									} else {
										// FIXME Error?
										var error = msg["error"];
										bootbox.alert(error);
										if(error.indexOf("already taken") > 0) {
											// FIXME Use status codes...
											$('#username').removeAttr('disabled').val("");
											$('#register').removeAttr('disabled').unbind('click').click(registerUsername);
										}
										// TODO Reset status
										videocall.hangup();
										if(spinner !== null && spinner !== undefined) {
											spinner.stop();
										}
										$('#waitingvideo').remove();
										$('#videos').hide();
										$('#peer').removeAttr('disabled').val('');
										$('#call').removeAttr('disabled').html(_('Call'))
											.removeClass("button-error").addClass("button-success")
											.unbind('click').click(doCall);
										$('#toggleaudio').attr('disabled', true);
										$('#togglevideo').attr('disabled', true);
										$('#bitrate').attr('disabled', true);
										$('#curbitrate').hide();
										$('#curres').hide();
										if(bitrateTimer !== null && bitrateTimer !== null) 
											clearInterval(bitrateTimer);
										bitrateTimer = null;
									}
								},
								onlocalstream: function(stream) {
									Janus.debug(" ::: Got a local stream :::");
									Janus.debug(JSON.stringify(stream));
									$('#videos').removeClass('hidden').show();
									if($('#myvideo').length === 0)
										$('#videoleft').append('<video class="rounded centered justfit" id="myvideo" autoplay muted="muted"/>');
									Janus.attachMediaStream($('#myvideo').get(0), stream);
									$("#myvideo").get(0).muted = "muted";
									$("#videoleft").parent().block({
										message: '<b>Publishing...</b>',
										css: {
											border: 'none',
											backgroundColor: 'transparent',
											color: 'white'
										}
									});
									// No remote video yet
									$('#videoright').append('<video class="rounded centered justfit" id="waitingvideo" />');
									if(spinner == null) {
										var target = document.getElementById('videoright');
										spinner = new Spinner({top:100}).spin(target);
									} else {
										spinner.spin();
									}
									var videoTracks = stream.getVideoTracks();
									if(videoTracks === null || videoTracks === undefined || videoTracks.length === 0) {
										// No webcam
										$('#myvideo').hide();
										$('#videoleft').append(
											'<div class="no-video-container">' +
												'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
												'<span class="no-video-text">No webcam available</span>' +
											'</div>');
									}
								},
								onremotestream: function(stream) {
									Janus.debug(" ::: Got a remote stream :::");
									Janus.debug(JSON.stringify(stream));
									if($('#remotevideo').length === 0)
										$('#videoright').append('<video class="rounded centered hidden justfit" id="remotevideo" autoplay/>');
									// Show the video, hide the spinner and show the resolution when we get a playing event
									$("#remotevideo").bind("playing", function () {
										$('#waitingvideo').remove();
										$('#remotevideo').removeClass('hidden');
										if(spinner !== null && spinner !== undefined)
											spinner.stop();
										spinner = null;
										var width = this.videoWidth;
										var height = this.videoHeight;
										$('#curres').removeClass('hidden').text(width+'x'+height).show();
									});
									Janus.attachMediaStream($('#remotevideo').get(0), stream);
									var videoTracks = stream.getVideoTracks();
									if(videoTracks === null || videoTracks === undefined || videoTracks.length === 0 || videoTracks[0].muted) {
										// No remote video
										$('#remotevideo').hide();
										$('#videoright').append(
											'<div class="no-video-container">' +
												'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
												'<span class="no-video-text">No remote video available</span>' +
											'</div>');
									}
									$('#callee').removeClass('hidden').html(yourusername).show();
									// Enable audio/video buttons and bitrate limiter
									audioenabled = true;
									videoenabled = true;
									$('#toggleaudio').html(_("Disable audio")).removeClass("button-success").addClass("button-error")
											.unbind('click').removeAttr('disabled').click(
										function() {
											audioenabled = !audioenabled;
											if(audioenabled)
												$('#toggleaudio').html(_("Disable audio")).removeClass("button-success").addClass("button-error");
											else
												$('#toggleaudio').html(_("Enable audio")).removeClass("button-error").addClass("button-success");
											videocall.send({"message": { "request": "set", "audio": audioenabled }});
										});
									$('#togglevideo').html(_("Disable video")).removeClass("button-success").addClass("button-error")
											.unbind('click').removeAttr('disabled').click(
										function() {
											videoenabled = !videoenabled;
											if(videoenabled)
												$('#togglevideo').html(_("Disable video")).removeClass("button-success").addClass("button-error");
											else
												$('#togglevideo').html(_("Enable video")).removeClass("button-error").addClass("button-success");
											videocall.send({"message": { "request": "set", "video": videoenabled }});
										});
									$('#toggleaudio').parent().removeClass('hidden').show();
									$('#bitrateset').html(_("Bandwidth"));
									$('#bitrate a').unbind('click').removeAttr('disabled').click(function() {
										var id = $(this).attr("id");
										var bitrate = parseInt(id)*1000;
										if(bitrate === 0) {
											Janus.log("Not limiting bandwidth via REMB");
										} else {
											Janus.log("Capping bandwidth to " + bitrate + " via REMB");
										}
										$('#bitrateset').html($(this).html()).parent().removeClass('open');
										videocall.send({"message": { "request": "set", "bitrate": bitrate }});
										return false;
									});
									if(adapter.browserDetails.browser === "chrome" || adapter.browserDetails.browser === "firefox" ||
											adapter.browserDetails.browser === "safari") {
										$('#curbitrate').removeClass('hidden').show();
										bitrateTimer = setInterval(function() {
											// Display updated bitrate, if supported
											var bitrate = videocall.getBitrate();
											$('#curbitrate').text(bitrate);
											// Check if the resolution changed too
											var width = $("#remotevideo").get(0).videoWidth;
											var height = $("#remotevideo").get(0).videoHeight;
											if(width > 0 && height > 0)
												$('#curres').removeClass('hidden').text(width+'x'+height).show();
										}, 1000);
									}
								},
								ondataopen: function(data) {
									Janus.log("The DataChannel is available!");
									$('#videos').removeClass('hidden').show();
									$('#datasend').removeAttr('disabled');
								},
								ondata: function(data) {
									Janus.debug("We got data from the DataChannel! " + data);
									$('#datarecv').val(data);
								},
								oncleanup: function() {
									Janus.log(" ::: Got a cleanup notification :::");
									$('#myvideo').remove();
									$('#remotevideo').remove();
									$("#videoleft").parent().unblock();
									$('#callee').empty().hide();
									yourusername = null;
									$('#curbitrate').hide();
									$('#curres').hide();
									$('#videos').hide();
									$('#toggleaudio').attr('disabled', true);
									$('#togglevideo').attr('disabled', true);
									$('#bitrate').attr('disabled', true);
									$('#curbitrate').hide();
									$('#curres').hide();
									if(bitrateTimer !== null && bitrateTimer !== null) 
										clearInterval(bitrateTimer);
									bitrateTimer = null;
									$('#waitingvideo').remove();
									$('#videos').hide();
									$('#peer').removeAttr('disabled').val('');
									$('#call').removeAttr('disabled').html(_('Call'))
										.removeClass("button-error").addClass("button-success")
										.unbind('click').click(doCall);
								}
							});
					},
					error: function(error) {
						Janus.error(error);
						bootbox.alert(error, function() {
							window.location.reload();
						});
					},
					destroyed: function() {
						window.location.reload();
					}
				}
			);
		});
	}});
});

function checkEnter(field, event) {
	var theCode = event.keyCode ? event.keyCode : event.which ? event.which : event.charCode;
	if(theCode == 13) {
		if(field.id == 'username')
			registerUsername();
		else if(field.id == 'peer')
			doCall();
		else if(field.id == 'datasend')
			sendData();
		return false;
	} else {
		return true;
	}
}

function registerUsername() {
	// Try a registration
	$('#username').attr('disabled', true);
	$('#register').attr('disabled', true).unbind('click');
	var username = $('#username').val();
	if(username === "") {
		bootbox.alert("Insert a username to register (e.g., pippo)");
		$('#username').removeAttr('disabled');
		$('#register').removeAttr('disabled').click(registerUsername);
		return;
	}
	if(/[^a-zA-Z0-9]/.test(username)) {
		bootbox.alert('Input is not alphanumeric');
		$('#username').removeAttr('disabled').val("");
		$('#register').removeAttr('disabled').click(registerUsername);
		return;
	}
	var register = { "request": "register", "username": username };
	videocall.send({"message": register});
}

function doCall() {
	// Call someone
	$('#peer').attr('disabled', true);
	$('#call').attr('disabled', true).unbind('click');
	var username = $('#peer').val();
	if(username === "") {
		bootbox.alert("Insert a username to call (e.g., pluto)");
		$('#peer').removeAttr('disabled');
		$('#call').removeAttr('disabled').click(doCall);
		return;
	}
	if(/[^a-zA-Z0-9]/.test(username)) {
		bootbox.alert('Input is not alphanumeric');
		$('#peer').removeAttr('disabled').val("");
		$('#call').removeAttr('disabled').click(doCall);
		return;
	}
	// Call this user
	videocall.createOffer(
		{
			// By default, it's sendrecv for audio and video...
			media: { data: true },	// ... let's negotiate data channels as well
			success: function(jsep) {
				Janus.debug("Got SDP!");
				Janus.debug(jsep);
				var body = { "request": "call", "username": $('#peer').val() };
				var comment = $("#comment").val();
				if (comment.length > 0) {
					body["comment"] = comment;
				}
				videocall.send({"message": body, "jsep": jsep});
			},
			error: function(error) {
				Janus.error("WebRTC error...", error);
				bootbox.alert("WebRTC error... " + error);
			}
		});
}

function doHangup() {
	// Hangup a call
	$('#call').attr('disabled', true).unbind('click');
	var hangup = { "request": "hangup" };
	videocall.send({"message": hangup});
	videocall.hangup();
	yourusername = null;
}

function sendData() {
	var data = $('#datasend').val();
	if(data === "") {
		bootbox.alert('Insert a message to send on the DataChannel to your peer');
		return;
	}
	videocall.data({
		text: data,
		error: function(reason) { bootbox.alert(reason); },
		success: function() { $('#datasend').val(''); },
	});
}

function missedCallNotify() {
	Janus.log('Missed call from ' + yourusername);
	$.get(event_uri + '/missedcall', {caller: yourusername, comment: $("#comment").val()});
}
