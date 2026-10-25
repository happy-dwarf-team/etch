# Changelog

## [0.3.0](https://github.com/happy-dwarf-team/etch/compare/v0.2.0...v0.3.0) (2026-10-25)


### Features

* **core:** write the preview copy with the backdrop ([#107](https://github.com/happy-dwarf-team/etch/issues/107)) ([97965e5](https://github.com/happy-dwarf-team/etch/commit/97965e530a90d6051347cc69507730233f0b74c7))
* **extension:** create and remove the game host install ([#110](https://github.com/happy-dwarf-team/etch/issues/110)) ([600f67f](https://github.com/happy-dwarf-team/etch/commit/600f67fc66e39b8ec9bfb2a8af3321fbbffb5e25)), closes [#48](https://github.com/happy-dwarf-team/etch/issues/48)
* **extension:** restart and watch the game host ([#121](https://github.com/happy-dwarf-team/etch/issues/121)) ([17a906d](https://github.com/happy-dwarf-team/etch/commit/17a906d50d622e293e2e9478c69635a71169e95c))
* **extension:** start, stop and own the game host process ([#112](https://github.com/happy-dwarf-team/etch/issues/112)) ([6567ddd](https://github.com/happy-dwarf-team/etch/commit/6567ddde967b8ebc8f9f076def16f0c31b9284e7)), closes [#49](https://github.com/happy-dwarf-team/etch/issues/49)
* **plugin:** add Etch's Anvil plugin with the session pipe ([#109](https://github.com/happy-dwarf-team/etch/issues/109)) ([7a3ef25](https://github.com/happy-dwarf-team/etch/commit/7a3ef25a5772bd9e58b8469807d03d2fc9ddd8dd)), closes [#45](https://github.com/happy-dwarf-team/etch/issues/45)
* preview eu3dialogtype windows in the game host ([#129](https://github.com/happy-dwarf-team/etch/issues/129)) ([1dc3ce1](https://github.com/happy-dwarf-team/etch/commit/1dc3ce1cd57a0860aa4e68c8e4a86d4977756ec1)), closes [#118](https://github.com/happy-dwarf-team/etch/issues/118)
* report diagnostics from the game ([#120](https://github.com/happy-dwarf-team/etch/issues/120)) ([9d2e1b5](https://github.com/happy-dwarf-team/etch/commit/9d2e1b572c6bc02d1ddd84d4bee0db9db39aa13c))
* run preview jobs with dual capture ([#115](https://github.com/happy-dwarf-team/etch/issues/115)) ([95ed054](https://github.com/happy-dwarf-team/etch/commit/95ed054c9b2ff236c45308892fb8a9e794d05f0d))


### Bug Fixes

* close the CodeQL polynomial ReDoS and escaping alerts ([#124](https://github.com/happy-dwarf-team/etch/issues/124)) ([97769e9](https://github.com/happy-dwarf-team/etch/commit/97769e9e8a1363046c9e5d316c7272557d7dc96a))
* **extension:** start the Windows helper without module discovery ([#114](https://github.com/happy-dwarf-team/etch/issues/114)) ([2587c38](https://github.com/happy-dwarf-team/etch/commit/2587c388b2da4d31c2d1140ad7ac4bddd5568274))
* **plugin:** reload textures once the wrapper holds them ([#127](https://github.com/happy-dwarf-team/etch/issues/127)) ([fc1f821](https://github.com/happy-dwarf-team/etch/commit/fc1f821510daa390af0aec0287d40b4d6c585b1c))


### Build

* **pins:** pin anvil and bellows and package them with their notices ([#106](https://github.com/happy-dwarf-team/etch/issues/106)) ([efb6209](https://github.com/happy-dwarf-team/etch/commit/efb6209c3450efa3140446dc43df6e920656c719))

## [0.2.0](https://github.com/happy-dwarf-team/etch/compare/v0.1.0...v0.2.0) (2026-10-24)


### Features

* **corpus:** compare a window's position, not its size ([#102](https://github.com/happy-dwarf-team/etch/issues/102)) ([e2ffc00](https://github.com/happy-dwarf-team/etch/commit/e2ffc008427e97defdc00b33b3e4be6df5e09842))
* **corpus:** compare captures widget by widget ([#82](https://github.com/happy-dwarf-team/etch/issues/82)) ([2263581](https://github.com/happy-dwarf-team/etch/commit/2263581231fe37b7695dabaf2f32159bfb431444))
* **corpus:** compare what the game's code moves where the game shows it ([#98](https://github.com/happy-dwarf-team/etch/issues/98)) ([34e56d2](https://github.com/happy-dwarf-team/etch/commit/34e56d2dbf4597d55abf22c584ab42072f634a38))
* **corpus:** confirm the five corpus resolutions below the monitor ([#81](https://github.com/happy-dwarf-team/etch/issues/81)) ([d604b46](https://github.com/happy-dwarf-team/etch/commit/d604b467dc2b71688b486c86ad0052bc18ee2f4e)), closes [#18](https://github.com/happy-dwarf-team/etch/issues/18)
* **corpus:** define the corpus manifest and capture records ([#79](https://github.com/happy-dwarf-team/etch/issues/79)) ([d067494](https://github.com/happy-dwarf-team/etch/commit/d067494c854f3e13c20fc0d4c9a068eb71f695ee))
* **corpus:** leave out a few unstable pixels instead of failing on one ([#95](https://github.com/happy-dwarf-team/etch/issues/95)) ([ef9a3a9](https://github.com/happy-dwarf-team/etch/commit/ef9a3a9a3b59a30443bff6f11de78ae21b6a6b07))
* **corpus:** leave out code-filled widgets the game never made ([#101](https://github.com/happy-dwarf-team/etch/issues/101)) ([fb3263b](https://github.com/happy-dwarf-team/etch/commit/fb3263b310c07e0c49d3da0445e29652aa901a46))
* **corpus:** mask the states the game's code sets ([#90](https://github.com/happy-dwarf-team/etch/issues/90)) ([8f882bb](https://github.com/happy-dwarf-team/etch/commit/8f882bb591c07c3b4f9591f2c45264d12edaf5b5))
* **corpus:** pass the corpus for vanilla and Proper 2K UI Enhanced ([#104](https://github.com/happy-dwarf-team/etch/issues/104)) ([a11f08f](https://github.com/happy-dwarf-team/etch/commit/a11f08f0e219bbdbd4384a71938f9874b612005c))
* **corpus:** pin the real mouse cursor during a capture run ([#87](https://github.com/happy-dwarf-team/etch/issues/87)) ([0f9dbeb](https://github.com/happy-dwarf-team/etch/commit/0f9dbeb613a54fb15ba4f9aa521793bed74c4700))
* **corpus:** script the capture driver with Tongs ([#84](https://github.com/happy-dwarf-team/etch/issues/84)) ([922a610](https://github.com/happy-dwarf-team/etch/commit/922a610288edac6ce2c1f3c3fa21fec44aaa04d6))
* **corpus:** take code-created roots the view names code-filled ([#103](https://github.com/happy-dwarf-team/etch/issues/103)) ([77af07e](https://github.com/happy-dwarf-team/etch/commit/77af07e79d851ea2983441b87cab40645c5723e7))


### Bug Fixes

* **core:** draw DXT images at the size of their whole blocks ([#92](https://github.com/happy-dwarf-team/etch/issues/92)) ([7275b21](https://github.com/happy-dwarf-team/etch/commit/7275b211118a6e2726728d09bf4f4d1d94c66907))
* **core:** draw scaled and screen-sized sprites as the game does ([#91](https://github.com/happy-dwarf-team/etch/issues/91)) ([4320525](https://github.com/happy-dwarf-team/etch/commit/4320525696b540a09aea6b5decb5e3216dbcb3df))
* **core:** keep resolution-picked sprites and measure variants from the window ([#100](https://github.com/happy-dwarf-team/etch/issues/100)) ([abe6fdd](https://github.com/happy-dwarf-team/etch/commit/abe6fdd097c62fc25a0b3cd2580047638ce24a3e))
* **core:** load the font of an empty text box to size it ([#99](https://github.com/happy-dwarf-team/etch/issues/99)) ([675dd01](https://github.com/happy-dwarf-team/etch/commit/675dd01d26548ac822cd87108376a1872dbca600))
* **core:** pick the sprite variant that fits on the screen ([#94](https://github.com/happy-dwarf-team/etch/issues/94)) ([30a2dbd](https://github.com/happy-dwarf-team/etch/commit/30a2dbd6071098f0c2b58baa50d7bc4969e3dee1))
* **core:** size and place text as the game does ([#86](https://github.com/happy-dwarf-team/etch/issues/86)) ([7ebf902](https://github.com/happy-dwarf-team/etch/commit/7ebf902caaea32631dc4b0223168337606d5183f))
* **corpus:** treat a game widget of negative size as absent ([#85](https://github.com/happy-dwarf-team/etch/issues/85)) ([c5ba370](https://github.com/happy-dwarf-team/etch/commit/c5ba370dbefa7d39a651dc8084503bf7c42d39a8))

## 0.1.0 (2026-10-21)


### Features

* **core:** add the draw-list contract ([#68](https://github.com/happy-dwarf-team/etch/issues/68)) ([db9b550](https://github.com/happy-dwarf-team/etch/commit/db9b55097a1deb09778433ff57df6bdb765e89eb))
* **core:** build the widget model and the sprite index ([#70](https://github.com/happy-dwarf-team/etch/issues/70)) ([7d707e4](https://github.com/happy-dwarf-team/etch/commit/7d707e4180e548bfcc289fc814a249d97680a34d))
* **core:** find the game, the mods and the playset ([#66](https://github.com/happy-dwarf-team/etch/issues/66)) ([3144a14](https://github.com/happy-dwarf-team/etch/commit/3144a143dd5fd900ad2df4e56ef02d252f15114a))
* **core:** lay out windows and produce the draw list ([#71](https://github.com/happy-dwarf-team/etch/issues/71)) ([c10a4e7](https://github.com/happy-dwarf-team/etch/commit/c10a4e73268fa827d34238c90c82e1d912692002)), closes [#34](https://github.com/happy-dwarf-team/etch/issues/34)
* **core:** load localisation in the chosen language ([#61](https://github.com/happy-dwarf-team/etch/issues/61)) ([9951ddb](https://github.com/happy-dwarf-team/etch/commit/9951ddb4806b600de13063bf2363b3fa74f36c51))
* **core:** parse Paradox script with source ranges ([#62](https://github.com/happy-dwarf-team/etch/issues/62)) ([b9069c3](https://github.com/happy-dwarf-team/etch/commit/b9069c3bf4cdca9e923676e923894d7e4c946ffd))
* **core:** read BMFont fonts and lay out text ([#64](https://github.com/happy-dwarf-team/etch/issues/64)) ([3a64edd](https://github.com/happy-dwarf-team/etch/commit/3a64edd52109fce5833a5b19223be56a59f1656f))
* **extension:** add the widget outline and navigation ([#72](https://github.com/happy-dwarf-team/etch/issues/72)) ([3ca1a95](https://github.com/happy-dwarf-team/etch/commit/3ca1a95819923acead5d8b5df1bbcafcf7e08e47))
* **extension:** choose the preview resolution ([#75](https://github.com/happy-dwarf-team/etch/issues/75)) ([b374075](https://github.com/happy-dwarf-team/etch/commit/b374075de4224b2e919a7a974bc38b18a08f8e5f))
* **extension:** redraw textures and fonts changed on disk and restore the preview after a reload ([#74](https://github.com/happy-dwarf-team/etch/issues/74)) ([e3eacb2](https://github.com/happy-dwarf-team/etch/commit/e3eacb2e7653229330a2e4f9251f3a6ad9d15d23))
* **extension:** show the previewed window in the preview ([#73](https://github.com/happy-dwarf-team/etch/issues/73)) ([e1d6c66](https://github.com/happy-dwarf-team/etch/commit/e1d6c66c2f59b2419efc5eabc8f87f4cc78b148d)), closes [#36](https://github.com/happy-dwarf-team/etch/issues/36)
* read game text from the editor buffer and from disk ([#63](https://github.com/happy-dwarf-team/etch/issues/63)) ([91057c7](https://github.com/happy-dwarf-team/etch/commit/91057c7bfc661384b5aea03cb3c4581bd95654fb))
* **renderer:** draw the draw list with WebGL2 ([#69](https://github.com/happy-dwarf-team/etch/issues/69)) ([10768e3](https://github.com/happy-dwarf-team/etch/commit/10768e385deb88112a622af82f1ad26e63e6615b))
* **renderer:** read DDS and TGA textures and upload them to WebGL2 ([#67](https://github.com/happy-dwarf-team/etch/issues/67)) ([7afbea8](https://github.com/happy-dwarf-team/etch/commit/7afbea896263d303d6f1f573635f28e3e3b747d0))
