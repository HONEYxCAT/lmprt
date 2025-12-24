(function () {
	"use strict";
	var Subscribe = Lampa.Subscribe;

	function RuTube(call_video) {
		var stream_url;
		var object = $('<div class="player-video__youtube"><div class="player-video__youtube-layer"></div></div>');
		var video = object[0];
		var listener = Subscribe();

		var html_video = $('<video style="width:100%;height:100%;position:absolute;top:0;left:0;" />');
		object.append(html_video);

		var first_play_event = false;
		var last_video_width = 0;
		var last_video_height = 0;
		var ready_sent = false;

		Object.defineProperty(video, "src", {
			set: function (url) {
				stream_url = url;
			},
			get: function () {},
		});
		Object.defineProperty(video, "paused", {
			get: function () {
				return html_video[0].paused;
			},
		});
		Object.defineProperty(video, "currentTime", {
			set: function (t) {
				try {
					html_video[0].currentTime = t;
				} catch (e) {}
			},
			get: function () {
				return html_video[0].currentTime;
			},
		});
		Object.defineProperty(video, "duration", {
			get: function () {
				return html_video[0].duration || 0;
			},
		});

		Object.defineProperty(video, "videoWidth", {
			get: function () {
				return html_video[0].videoWidth || 0;
			},
		});
		Object.defineProperty(video, "videoHeight", {
			get: function () {
				return html_video[0].videoHeight || 0;
			},
		});

		video.addEventListener = listener.follow.bind(listener);

		function onReady() {
			if (ready_sent) return;
			ready_sent = true;
			listener.send("loadeddata");
			listener.send("canplay");
			listener.send("resize");
			var dur = html_video[0].duration || 0;
			if (dur > 0) listener.send("durationchange", { duration: dur });
		}

		html_video.on("loadedmetadata", onReady);
		html_video.on("resize", function () {
			listener.send("resize");
		});

		html_video.on("canplay", function () {
			onReady();
			if (html_video[0].paused) {
				var p = html_video[0].play();
				if (p && p.catch) p.catch(function () {});
			}
		});

		html_video.on("playing", function () {
			listener.send("playing");
			listener.send("play");
			listener.send("resize");
			if (typeof Lampa.PlayerPanel !== "undefined") Lampa.PlayerPanel.update("play");
		});

		html_video.on("pause", function () {
			listener.send("pause");
		});
		html_video.on("ended", function () {
			listener.send("ended");
		});

		html_video.on("timeupdate", function () {
			listener.send("timeupdate");
			if (!first_play_event && html_video[0].currentTime > 0.5) {
				first_play_event = true;
				listener.send("resize");
				var dur = html_video[0].duration || 0;
				listener.send("durationchange", { duration: dur });
				listener.send("playing");
				listener.send("play");
			}
			var w = html_video[0].videoWidth || 0;
			var h = html_video[0].videoHeight || 0;
			if (w > 0 && h > 0 && (w !== last_video_width || h !== last_video_height)) {
				last_video_width = w;
				last_video_height = h;
				listener.send("resize");
			}
		});

		html_video.on("error", function () {
			var err = html_video[0].error;
			var msg = err ? err.message || err.code : "Unknown";
			listener.send("error", { error: "Video Error: " + msg });
		});

		video.load = function () {
			var id;
			var m = stream_url.match(/^https?:\/\/(www\.)?rutube\.ru\/(play\/embed|video\/private|video|shorts)\/([\da-f]{32,})/i);
			if (m) id = m[3];

			if (!id) return Lampa.Noty.show("Rutube ID not found");

			var apiUrl = "https://rutube.ru/api/play/options/" + id + "/?format=json&no_404=true";
			var network = new Lampa.Reguest();

			function parseM3U8AndGetBestQuality(masterUrl, callback) {
				var xhr = new XMLHttpRequest();
				xhr.open("GET", masterUrl, true);
				xhr.onload = function () {
					if (xhr.status === 200) {
						var content = xhr.responseText;
						var lines = content.split("\n");
						var streams = [];
						var baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1);

						for (var i = 0; i < lines.length; i++) {
							var line = lines[i].trim();
							if (line.startsWith("#EXT-X-STREAM-INF:")) {
								var resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
								var bwMatch = line.match(/BANDWIDTH=(\d+)/);
								var nextLine = lines[i + 1] ? lines[i + 1].trim() : "";
								if (nextLine && !nextLine.startsWith("#")) {
									var streamUrl = nextLine;
									if (!streamUrl.startsWith("http")) {
										streamUrl = baseUrl + streamUrl;
									}
									streams.push({
										width: resMatch ? parseInt(resMatch[1], 10) : 0,
										height: resMatch ? parseInt(resMatch[2], 10) : 0,
										bandwidth: bwMatch ? parseInt(bwMatch[1], 10) : 0,
										url: streamUrl,
									});
								}
							}
						}

						if (streams.length > 0) {
							streams.sort(function (a, b) {
								return (b.height || b.bandwidth) - (a.height || a.bandwidth);
							});
							var best = streams[0];
							callback(best.url, best.height);
						} else {
							callback(masterUrl, 0);
						}
					} else {
						callback(masterUrl, 0);
					}
				};
				xhr.onerror = function () {
					callback(masterUrl, 0);
				};
				xhr.send();
			}

			network.native(apiUrl, function (json) {
				if (json && json.video_balancer && json.video_balancer.m3u8) {
					parseM3U8AndGetBestQuality(json.video_balancer.m3u8, function (bestUrl, height) {
						html_video.attr("src", bestUrl);
						var levels = [{ title: "Auto", quality: "Auto", selected: false }];
						if (height > 0) {
							levels.push({ title: height + "p", quality: height + "p", selected: true });
						}
						listener.send("levels", {
							levels: levels,
							current: height > 0 ? height + "p" : "Auto",
						});
					});
				} else {
					Lampa.Noty.show("Rutube: video not available");
				}
			});
		};

		video.play = function () {
			html_video[0].play();
		};
		video.pause = function () {
			html_video[0].pause();
		};
		video.destroy = function () {
			html_video.remove();
			object.remove();
			listener.destroy();
		};

		call_video(video);
		return object;
	}
	Lampa.PlayerVideo.registerTube({
		name: "RuTube",
		verify: function (src) {
			return /^https?:\/\/(www\.)?rutube\.ru\/(play\/embed|video\/private|video|shorts)\/([\da-f]{32,})\/?(\?p=([^&]+))?/i.test(src);
		},
		create: RuTube,
	});

	var proxy = "";
	var rootuTrailerApi = Lampa.Utils.protocol() + "trailer.rootu.top/search/";

	function cleanString(str) {
		return str
			.replace(/[^a-zA-Z\dа-яА-ЯёЁ]+/g, " ")
			.trim()
			.toLowerCase();
	}

	function cacheRequest(movie, isTv, success, fail) {
		var context = this;
		var year = (movie.release_date || movie.first_air_date || "")
			.toString()
			.replace(/\D+/g, "")
			.substring(0, 4)
			.replace(/^([03-9]\d|1[0-8]|2[1-9]|20[3-9])\d+$/, "");
		var search = movie.title || movie.name || movie.original_title || movie.original_name || "";
		var cleanSearch = cleanString(search);
		if (cleanSearch.length < 2) {
			return fail();
		}
		var searchOrig = movie.original_title || movie.original_name || "";
		var query = cleanString([search, year, "русский трейлер", isTv ? "сезон 1" : ""].join(" "));
		var rutubeApiUrl = "https://rutube.ru/api/search/video/" + "?query=" + encodeURIComponent(query) + "&format=json";
		var tmdbId = movie.id ? "000000" + movie.id : "";
		if (tmdbId.length > 7) tmdbId = tmdbId.slice(-Math.max(7, (movie.id + "").length));
		var type = isTv ? "tv" : "movie";
		var rootuTrailersUrl = rootuTrailerApi + type + "/" + tmdbId + ".json";

		var id = type + (tmdbId || (Lampa.Utils.hash(search) * 1).toString(36));
		var key = "RUTUBE_trailer_" + id;
		var data = sessionStorage.getItem(key);

		if (data) {
			data = JSON.parse(data);
			if (data[0]) typeof success === "function" && success.apply(context, [data[1]]);
			else typeof fail === "function" && fail.apply(context, [data[1]]);
			return;
		}

		function fetchFromRutubeApi() {
			var si = Math.floor(new Date().getTime() / 1000).toString(36);
			var network = new Lampa.Reguest();
			network.native(
				proxy + rutubeApiUrl,
				function (data) {
					var results = [];
					if (!!data && !!data.results && !!data.results[0]) {
						var queryWord = query.split(" ");
						if (searchOrig !== "" && search !== searchOrig) queryWord.push.apply(queryWord, cleanString(searchOrig).split(" "));
						si += "=" + (Lampa.Utils.hash(si + id) * 1).toString(36);
						queryWord.push(isTv ? "сериал" : "фильм", "русском", "финальный", "4k", "fullhd", "ultrahd", "ultra", "hd", "1080p");
						var getRate = function (r) {
							if (r._rate === -1) {
								r._rate = 0;
								var si = r._title.indexOf(cleanSearch);
								var rw = r._title.split(" ");
								if (si >= 0) {
									r._rate += 300;
									if (year) {
										var ow = r._title
											.substring(si + cleanSearch.length)
											.trim()
											.split(" ");
										if (ow.length && ow[0] !== year && /^(\d+|[ivx]+)$/.test(ow[0])) r._rate = -1000;
										ow = rw.filter(function (w) {
											return w.length === 4 && /^([03-9]\d|1[0-8]|2[1-9]|20[3-9])\d+$/.test(w);
										});
										if (ow.indexOf(year) >= 0) r._rate += 100;
										else for (si in ow) if (cleanSearch.indexOf(ow[si]) < 0) r._rate = -1000;
									}
								} else {
									r._rate = -2000;
								}
								var rf = rw.filter(function (w) {
									return queryWord.indexOf(w) >= 0;
								});
								var wordDiff = rw.length - rf.length;
								r._rate += rf.length * 100;
								r._rate -= wordDiff * 200;
								r._rate += r.duration > 120 ? 50 : -50;
							}
							return r._rate;
						};
						results = data.results
							.filter(function (r) {
								r._title = cleanString(r.title);
								r._rate = -1;
								var isTrailer = r._title.indexOf("трейлер") >= 0 || r._title.indexOf("trailer") >= 0 || r._title.indexOf("тизер") >= 0;
								var durationOk = r.duration && r.duration < 300;
								return !!r.embed_url && isTrailer && durationOk && !r.is_hidden && !r.is_deleted && !r.is_locked && !r.is_audio && !r.is_paid && !r.is_livestream && !r.is_adult && getRate(r) > 400;
							})
							.sort(function (a, b) {
								return getRate(b) - getRate(a);
							});
					}

					if (results.length) {
						sessionStorage.setItem(key, JSON.stringify([true, results, search]));
						typeof success === "function" && success.apply(context, [results]);

						if (tmdbId && /^\d+$/.test(tmdbId)) {
							var simplifiedResults = results.map(function (r) {
								return {
									title: r.title,
									url: r.video_url || r.embed_url,
									thumbnail_url: r.thumbnail_url,
									duration: r.duration,
									author: r.author,
								};
							});
							var postNetwork = new Lampa.Reguest();
							postNetwork.quiet(
								rootuTrailersUrl + "?" + si,
								function () {
									postNetwork.clear();
								},
								function () {
									postNetwork.clear();
								},
								JSON.stringify(simplifiedResults),
							);
						}
					} else {
						sessionStorage.setItem(key, JSON.stringify([false, {}, search]));
						typeof fail === "function" && fail.apply(context, [{}]);
					}
					network.clear();
					network = null;
				},
				function (data) {
					if (!proxy && !window.AndroidJS && !!data && "status" in data && "readyState" in data && data.status === 0 && data.readyState === 0) {
						proxy = Lampa.Storage.get("rutube_search_proxy", "") || "https://rutube-search.root-1a7.workers.dev/";
						if (proxy.substr(-1) !== "/") proxy += "/";
						if (proxy === "/") {
							sessionStorage.setItem(key, JSON.stringify([false, {}, search]));
							typeof fail === "function" && fail.apply(context, [{}]);
						} else {
							fetchFromRutubeApi();
						}
					} else {
						sessionStorage.setItem(key, JSON.stringify([false, data, search]));
						typeof fail === "function" && fail.apply(context, [data]);
					}
					network.clear();
					network = null;
				},
			);
		}

		if (!tmdbId || /\D/.test(tmdbId)) {
			fetchFromRutubeApi();
			return;
		}

		var rootuTopNetwork = new Lampa.Reguest();
		rootuTopNetwork.timeout(2000);
		rootuTopNetwork.native(
			rootuTrailersUrl,
			function (rootuTrailerData) {
				if (rootuTrailerData && rootuTrailerData.length) {
					sessionStorage.setItem(key, JSON.stringify([true, rootuTrailerData, search]));
					typeof success === "function" && success.apply(context, [rootuTrailerData]);
				} else {
					fetchFromRutubeApi();
				}
				rootuTopNetwork.clear();
				rootuTopNetwork = null;
			},
			function (xhr) {
				fetchFromRutubeApi();
				rootuTopNetwork.clear();
				rootuTopNetwork = null;
			},
		);
	}

	function loadTrailers(event, success, fail) {
		if (!event.object || !event.object.source || !event.data || !event.data.movie) return;
		var movie = event.data.movie;
		var isTv = !!event.object && !!event.object.method && event.object.method === "tv";
		var title = movie.title || movie.name || movie.original_title || movie.original_name || "";
		if (title === "") return;
		var searchOk = function (data) {
			if (!!data[0]) {
				success(data);
			} else {
				fail();
			}
		};
		cacheRequest(movie, isTv, searchOk, fail);
	}

	Lampa.Lang.add({
		rutube_trailer_trailer: {
			be: "Трэйлер",
			bg: "Трейлър",
			cs: "Trailer",
			en: "Trailer",
			he: "טריילר",
			pt: "Trailer",
			ru: "Трейлер",
			uk: "Трейлер",
			zh: "预告片",
		},
		rutube_trailer_trailers: {
			be: "Трэйлеры",
			bg: "Трейлъри",
			cs: "Trailery",
			en: "Trailers",
			he: "טריילרים",
			pt: "Trailers",
			ru: "Трейлеры",
			uk: "Трейлери",
			zh: "预告片",
		},
		rutube_trailer_preview: {
			be: "Перадпрагляд",
			bg: "Преглед",
			cs: "Náhled",
			en: "Preview",
			he: "תצוגה מקדימה",
			pt: "Pré-visualização",
			ru: "Превью",
			uk: "Попередній перегляд",
			zh: "预览",
		},
		rutube_trailer_rutube: {
			be: "Знойдзена на RUTUBE",
			bg: "Намерено в RUTUBE",
			cs: "Nalezeno na RUTUBE",
			en: "Found on RUTUBE",
			he: "נמצא ב-RUTUBE",
			pt: "Encontrado no RUTUBE",
			ru: "Найдено на RUTUBE",
			uk: "Знайдено на RUTUBE",
			zh: "在 RUTUBE 上找到",
		},
		rutube_trailers_title: {
			be: "RUTUBE: трэйлеры",
			bg: "RUTUBE: трейлъри",
			cs: "RUTUBE: trailery",
			en: "RUTUBE: trailers",
			he: "RUTUBE: טריילרים",
			pt: "RUTUBE: trailers",
			ru: "RUTUBE: трейлеры",
			uk: "RUTUBE: трейлери",
			zh: "RUTUBE：预告片",
		},
		rutube_trailer_404: {
			be: "Трэйлер не знойдзены.",
			bg: "Трейлърът не е намерен.",
			cs: "Trailer nebyl nalezen.",
			en: "Trailer not found.",
			he: "הטריילר לא נמצא.",
			pt: "Trailer não encontrado.",
			ru: "Трейлер не найден.",
			uk: "Трейлер не знайдено.",
			zh: "未找到预告片。",
		},
		rutube_trailer_wait: {
			be: "Пачакайце, яшчэ шукаем трэйлер...",
			bg: "Изчакайте, все още търсим трейлър...",
			cs: "Počkejte, stále hledáme trailer...",
			en: "Please wait, still looking for a trailer...",
			he: "אנא המתן, עדיין מחפשים טריילר...",
			pt: "Aguarde, ainda estamos procurando um trailer...",
			ru: "Подождите, ещё ищем трейлер...",
			uk: "Зачекайте, ще шукаємо трейлер...",
			zh: "请稍候，仍在寻找预告片……",
		},
	});

	function startPlugin() {
		window.rutube_trailer_plugin = true;

		Lampa.SettingsApi.addParam({
			component: "more",
			param: {
				name: "rutube_trailers",
				type: "trigger",
				default: true,
			},
			field: {
				name: Lampa.Lang.translate("rutube_trailers_title"),
			},
		});
		var button =
			'<div class="full-start__button selector view--rutube_trailer" data-subtitle="#{rutube_trailer_rutube}">' +
			'<svg width="134" height="134" viewBox="0 0 134 134" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M81.5361 62.9865H42.5386V47.5547H81.5361C83.814 47.5547 85.3979 47.9518 86.1928 48.6451C86.9877 49.3385 87.4801 50.6245 87.4801 52.5031V58.0441C87.4801 60.0234 86.9877 61.3094 86.1928 62.0028C85.3979 62.6961 83.814 62.9925 81.5361 62.9925V62.9865ZM84.2115 33.0059H26V99H42.5386V77.5294H73.0177L87.4801 99H106L90.0546 77.4287C95.9333 76.5575 98.573 74.7559 100.75 71.7869C102.927 68.8179 104.019 64.071 104.019 57.7359V52.7876C104.019 49.0303 103.621 46.0613 102.927 43.7857C102.233 41.51 101.047 39.5307 99.362 37.7528C97.5824 36.0698 95.6011 34.8845 93.2223 34.0904C90.8435 33.3971 87.8716 33 84.2115 33V33.0059Z" fill="currentColor"/><path d="M198 3.05176e-05C198 36.4508 168.451 66.0001 132 66.0001C124.589 66.0001 117.464 64.7786 110.814 62.5261C110.956 60.9577 111.019 59.3541 111.019 57.7359V52.7876C111.019 48.586 110.58 44.8824 109.623 41.7436C108.59 38.3588 106.82 35.4458 104.443 32.938L104.311 32.7988L104.172 32.667C101.64 30.2721 98.7694 28.5625 95.4389 27.4506L95.3108 27.4079L95.1812 27.3701C92.0109 26.446 88.3508 26 84.2115 26H77.2115V26.0059H71.3211C67.8964 18.0257 66 9.23434 66 3.05176e-05C66 -36.4508 95.5492 -66 132 -66C168.451 -66 198 -36.4508 198 3.05176e-05Z" fill="currentColor"/><rect x="1" y="1" width="130" height="130" stroke="currentColor" stroke-width="2"/></svg>' +
			"<span>#{rutube_trailer_trailers}</span>" +
			"</div>";

		Lampa.Listener.follow("full", function (event) {
			if (event.type === "complite" && Lampa.Storage.field("rutube_trailers")) {
				var render = event.object.activity.render();
				var trailerBtn = render.find(".view--trailer");
				var btn = $(Lampa.Lang.translate(button));
				if (trailerBtn.length) {
					trailerBtn.before(btn);
					trailerBtn.toggleClass("hide", !window.YT);
				} else {
					render.find(".full-start__button:last").after(btn);
				}
				var onEnter = function () {
					Lampa.Noty.show(Lampa.Lang.translate("rutube_trailer_wait"));
				};
				btn.on("hover:enter", function () {
					onEnter();
				});
				loadTrailers(
					event,
					function (data) {
						var playlist = [];
						data.forEach(function (res) {
							playlist.push({
								title: Lampa.Utils.shortText(res.title, 50),
								subtitle: Lampa.Utils.shortText(res.author.name, 30),
								url: res.video_url || res.embed_url || res.url,
								iptv: true,
								icon: '<img class="size-youtube" src="' + res.thumbnail_url + '" />',
								template: "selectbox_icon",
							});
						});
						onEnter = function () {
							Lampa.Select.show({
								title: Lampa.Lang.translate("rutube_trailers_title"),
								items: playlist,
								onSelect: function (a) {
									Lampa.Player.play(a);
									Lampa.Player.playlist(playlist);
								},
								onBack: function () {
									Lampa.Controller.toggle("full_start");
								},
							});
						};
						btn.removeClass("hide");
					},
					function () {
						btn.addClass("hide");
						onEnter = function () {
							Lampa.Noty.show(Lampa.Lang.translate("rutube_trailer_404"));
						};
					},
				);
			}
		});
	}
	if (!window.rutube_trailer_plugin) startPlugin();
})();
