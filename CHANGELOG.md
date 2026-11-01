# Changelog

## [2.0.0](https://github.com/happy-dwarf-team/etch/compare/v1.0.1...v2.0.0) (2026-11-01)


### ⚠ BREAKING CHANGES

* the plugin and the extension speak protocol 2 only; a protocol 1 peer gets protocol_mismatch. Both ship in one VSIX.
* **plugin:** the plugin no longer answers job requests; only Etch 1.x's game host sent them.
* the game host, the backend switch and the diff view are removed; their commands become etch.startLiveGame, etch.stopLiveGame and etch.removePrivateInstall. A 1.x game host install is deleted on first activation. Stay on 1.0.x for the game host.

### Features

* **core:** fill code-filled widgets from sample data layers ([#193](https://github.com/happy-dwarf-team/etch/issues/193)) ([6d64c9b](https://github.com/happy-dwarf-team/etch/commit/6d64c9b37b4fa144ca793c117cdf11fc352832f3))
* **core:** lay out the view a window profile chooses ([#185](https://github.com/happy-dwarf-team/etch/issues/185)) ([ef67d46](https://github.com/happy-dwarf-team/etch/commit/ef67d4697b3c116d98ae9edc3f3c540fc5272c89))
* **core:** read and layer window profiles ([#183](https://github.com/happy-dwarf-team/etch/issues/183)) ([94ae4a3](https://github.com/happy-dwarf-team/etch/commit/94ae4a3a5058241aa76a2e6693ae741454469a55))
* **core:** read text saves for sample data ([#191](https://github.com/happy-dwarf-team/etch/issues/191)) ([5eefc28](https://github.com/happy-dwarf-team/etch/commit/5eefc2863910ad354a9ec5662a8ef148f7eefd52))
* **corpus:** add the province views, recipes per playset and the visibility gate ([#201](https://github.com/happy-dwarf-team/etch/issues/201)) ([2a1fa97](https://github.com/happy-dwarf-team/etch/commit/2a1fa978a851b9b1f78d7641dab8e9611d225188))
* **corpus:** capture Proper 2K UI Enhanced from 2560x1440, and Anbennar alone below ([#216](https://github.com/happy-dwarf-team/etch/issues/216)) ([370251b](https://github.com/happy-dwarf-team/etch/commit/370251b138e44b59181e9d7580fa28b33487b5a3))
* **corpus:** capture the province views and gate the Anbennar playset ([#211](https://github.com/happy-dwarf-team/etch/issues/211)) ([73a8401](https://github.com/happy-dwarf-team/etch/commit/73a840165b83cb06c158e261b7e9687355b5a58d))
* **corpus:** mask the windows a playset's save shows over every view ([#203](https://github.com/happy-dwarf-team/etch/issues/203)) ([de23d03](https://github.com/happy-dwarf-team/etch/commit/de23d038a6e643160173ddabd248b750bcd78311))
* **corpus:** open province views with province open in recipes ([#231](https://github.com/happy-dwarf-team/etch/issues/231)) ([170171a](https://github.com/happy-dwarf-team/etch/commit/170171a6ab11028181f2d779f40cb27328e1e473)), closes [#221](https://github.com/happy-dwarf-team/etch/issues/221)
* **corpus:** wait for a ready session with Tongs' ready recipe ([#225](https://github.com/happy-dwarf-team/etch/issues/225)) ([cffbf88](https://github.com/happy-dwarf-team/etch/commit/cffbf88ba6698bf264b42d81566edd679f5395aa)), closes [#220](https://github.com/happy-dwarf-team/etch/issues/220)
* draw the game's text colours from the live snapshot ([#229](https://github.com/happy-dwarf-team/etch/issues/229)) ([fb16590](https://github.com/happy-dwarf-team/etch/commit/fb1659087ce6e45f35a40b19cd988e072fe15418))
* **extension:** choose sample data in Data and follow links ([#194](https://github.com/happy-dwarf-team/etch/issues/194)) ([846c059](https://github.com/happy-dwarf-team/etch/commit/846c05999c475ade62962c1648d311956e4f94fe))
* **extension:** choose views in the preview and the widget outline ([#188](https://github.com/happy-dwarf-team/etch/issues/188)) ([69dbce9](https://github.com/happy-dwarf-team/etch/commit/69dbce9f224dd04bba7c4a97b05d5ee514fc0857))
* **extension:** name the running build and warn when the installed one differs ([#226](https://github.com/happy-dwarf-team/etch/issues/226)) ([df5bf4a](https://github.com/happy-dwarf-team/etch/commit/df5bf4abc6485c0ddaed9badba865136184e4061))
* **extension:** offer the live game's saves for sample data ([#198](https://github.com/happy-dwarf-team/etch/issues/198)) ([9d9bdc6](https://github.com/happy-dwarf-team/etch/commit/9d9bdc6d9669ce881d7ae3e9304fcde9c84c3a30))
* **extension:** open a pick's definition and override it in the mod ([#200](https://github.com/happy-dwarf-team/etch/issues/200)) ([7ee0f27](https://github.com/happy-dwarf-team/etch/commit/7ee0f27577b158d925aa334ac84952bfa337075a))
* **extension:** reload each saved file into the live game by its policy ([#189](https://github.com/happy-dwarf-team/etch/issues/189)) ([a685ae2](https://github.com/happy-dwarf-team/etch/commit/a685ae236e5d8bb7108c712c62bc27a39362b026))
* **extension:** start and stop the live game with the player's settings and saves ([#187](https://github.com/happy-dwarf-team/etch/issues/187)) ([ef2c2f5](https://github.com/happy-dwarf-team/etch/commit/ef2c2f5a6a34d7cba9f6e468ca5db048d5545fe3))
* **extension:** zoom the preview in and out ([#217](https://github.com/happy-dwarf-team/etch/issues/217)) ([b3decc6](https://github.com/happy-dwarf-team/etch/commit/b3decc63600f6eefb2c58a5d21463da91b5f2212)), closes [#162](https://github.com/happy-dwarf-team/etch/issues/162)
* fill provinceview with sample data in Etch's profiles ([#195](https://github.com/happy-dwarf-team/etch/issues/195)) ([7d54c00](https://github.com/happy-dwarf-team/etch/commit/7d54c00e850778d0ab36f25284429b949ff542fd))
* finish the live game from its live runs, with docs/live-game.md ([#196](https://github.com/happy-dwarf-team/etch/issues/196)) ([b9366e1](https://github.com/happy-dwarf-team/etch/commit/b9366e17dc15ec404fbc6b426b8e0ebf80b401fa))
* go to protocol 2 with the live game's reload and save ([#186](https://github.com/happy-dwarf-team/etch/issues/186)) ([e9366ad](https://github.com/happy-dwarf-team/etch/commit/e9366add540eaf3f3364274d329a15bd85d6d882))
* **plugin:** pick mode, its pushes and live snapshots ([#199](https://github.com/happy-dwarf-team/etch/issues/199)) ([e1ea7e4](https://github.com/happy-dwarf-team/etch/commit/e1ea7e4e0b319e3d12555943e228725e35d41f97))
* **plugin:** remove the job request and the frame capture ([#178](https://github.com/happy-dwarf-team/etch/issues/178)) ([9f11f60](https://github.com/happy-dwarf-team/etch/commit/9f11f6008aca4f53a7dd170d715f1f906e3cb04a))
* retire the game host ([#177](https://github.com/happy-dwarf-team/etch/issues/177)) ([df38249](https://github.com/happy-dwarf-team/etch/commit/df382493d23b07e6d34839bbe30ae89dd58cbb93))
* ship window profiles for provinceview and the corpus windows ([#190](https://github.com/happy-dwarf-team/etch/issues/190)) ([d1f8882](https://github.com/happy-dwarf-team/etch/commit/d1f8882263e13d7def1aa3110f04cb5fa2ce02c4))
* take live snapshots into the preview ([#206](https://github.com/happy-dwarf-team/etch/issues/206)) ([4334b9a](https://github.com/happy-dwarf-team/etch/commit/4334b9aa4e3b2199a2e150cc909edf42a6a0f34c))
* type sample texts by hand, set list entries and draw the window a link opens ([#219](https://github.com/happy-dwarf-team/etch/issues/219)) ([d9241b4](https://github.com/happy-dwarf-team/etch/commit/d9241b47efcb15e33e51d59cdfe2c2641871e84c))


### Bug Fixes

* bake button text into a textSpriteType as the game does ([#215](https://github.com/happy-dwarf-team/etch/issues/215)) ([a73ce9f](https://github.com/happy-dwarf-team/etch/commit/a73ce9f60e489955c6efd0d42480f11921a5e424))
* **core:** draw the font icon ¤ and leave room for the flag @TAG in text ([#233](https://github.com/happy-dwarf-team/etch/issues/233)) ([a7deab0](https://github.com/happy-dwarf-team/etch/commit/a7deab08b9e2c759028cbd7bb50c471a5b91f412))
* **core:** pick a country view's background by its file's size steps ([#204](https://github.com/happy-dwarf-team/etch/issues/204)) ([6184385](https://github.com/happy-dwarf-team/etch/commit/6184385c612c6e8c657d62a9cc9247f21713165f))
* draw the province view's base values where the game does ([#223](https://github.com/happy-dwarf-team/etch/issues/223)) ([13602d6](https://github.com/happy-dwarf-team/etch/commit/13602d663d12b0e7046090798aa45b05ad378008))
* draw the province view's data-decided widgets only where the game shows them ([#218](https://github.com/happy-dwarf-team/etch/issues/218)) ([8b031c9](https://github.com/happy-dwarf-team/etch/commit/8b031c99cfa99eb135911a0a3df74c8c8a68ff2d))
* draw what the live snapshot shows, every text, list and state ([#228](https://github.com/happy-dwarf-team/etch/issues/228)) ([a2cef5c](https://github.com/happy-dwarf-team/etch/commit/a2cef5c293b601cbc0be903e27dc88e5378712df))
* **extension:** never close a live game that is only busy ([#222](https://github.com/happy-dwarf-team/etch/issues/222)) ([646834b](https://github.com/happy-dwarf-team/etch/commit/646834b50ff49c7354c711c303fee504e17be50f))
* place the province view's widgets by the game's code ([#224](https://github.com/happy-dwarf-team/etch/issues/224)) ([f5f9e51](https://github.com/happy-dwarf-team/etch/commit/f5f9e514f2d6beefdf7f2341e0cfce84a4746539))
* **plugin:** close the province view a rebuild opened, through the game's SDL queue ([#208](https://github.com/happy-dwarf-team/etch/issues/208)) ([88e3bd5](https://github.com/happy-dwarf-team/etch/commit/88e3bd515e9e3772c8dfdc9beec9a4e090091dd8))
* **plugin:** pick on the click that brings the game forward ([#227](https://github.com/happy-dwarf-team/etch/issues/227)) ([cc15ae3](https://github.com/happy-dwarf-team/etch/commit/cc15ae3718a56fb0ad858b3a4e3f4d5cd3b5f8ce))


### Performance

* **core:** inflate a save into one buffer and gate the save budgets ([#197](https://github.com/happy-dwarf-team/etch/issues/197)) ([f1b1c55](https://github.com/happy-dwarf-team/etch/commit/f1b1c55a79c95f0a74cf5a18a7358c9a4b555764))


### Build

* **pins:** pin tongs 0.17.0, anvil 1.5.2 and bellows 0.10.0 ([#182](https://github.com/happy-dwarf-team/etch/issues/182)) ([f046ac7](https://github.com/happy-dwarf-team/etch/commit/f046ac74ab1b37fbcfa0aeb7ecbc0fdbf33b17f4))
* **pins:** pin Tongs 0.18.0 for the lines of pick mode ([#214](https://github.com/happy-dwarf-team/etch/issues/214)) ([dec7a45](https://github.com/happy-dwarf-team/etch/commit/dec7a45d639c54d3554094630168e2c36d8620b4))
* **pins:** pin Tongs 0.22.0 for the text colours of live snapshots ([#230](https://github.com/happy-dwarf-team/etch/issues/230)) ([c2cf182](https://github.com/happy-dwarf-team/etch/commit/c2cf182661cbf4eafd0fa3112e6ad3b8750ba306))

## [1.0.1](https://github.com/happy-dwarf-team/etch/compare/v1.0.0...v1.0.1) (2026-10-26)


### Bug Fixes

* **corpus:** hold the lab's game lock for a whole capture run ([#148](https://github.com/happy-dwarf-team/etch/issues/148)) ([7f013d4](https://github.com/happy-dwarf-team/etch/commit/7f013d45db7ddf896104e9d4f5beaa7a263e7df3))

## [1.0.0](https://github.com/happy-dwarf-team/etch/compare/v0.4.0...v1.0.0) (2026-10-26)


### Features

* **extension:** leave preview with 1.0.0 ([#147](https://github.com/happy-dwarf-team/etch/issues/147)) ([093deec](https://github.com/happy-dwarf-team/etch/commit/093deec4073bb9c507657d1a8726918634456667))

## [0.4.0](https://github.com/happy-dwarf-team/etch/compare/v0.3.0...v0.4.0) (2026-10-26)


### Features

* add the diff view ([#131](https://github.com/happy-dwarf-team/etch/issues/131)) ([b05a14f](https://github.com/happy-dwarf-team/etch/commit/b05a14fbb7b0e86ba857822438de96a70d457b04))


### Bug Fixes

* **core:** size a scaled frame of an uneven strip by a whole cell ([#138](https://github.com/happy-dwarf-team/etch/issues/138)) ([e708c59](https://github.com/happy-dwarf-team/etch/commit/e708c59334b5f373151ac463f51cbc2760ed2b73))
* **corpus:** click a playset's save confirmation while the save loads ([#137](https://github.com/happy-dwarf-team/etch/issues/137)) ([f559764](https://github.com/happy-dwarf-team/etch/commit/f559764a7ea3887e502eef596abc6cf68c5c6ce5))

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
