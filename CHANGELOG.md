# Changelog

## [1.109.1](https://github.com/s977043/river-review/compare/v1.109.0...v1.109.1) (2026-09-10)


### Bug Fixes

* **security:** [#2033](https://github.com/s977043/river-review/issues/2033) redact URL userinfo and password assignments ([#2038](https://github.com/s977043/river-review/issues/2038)) ([7360df8](https://github.com/s977043/river-review/commit/7360df842813a891c89af968c19a82805069e7e4))

## [1.109.0](https://github.com/s977043/river-review/compare/v1.108.0...v1.109.0) (2026-09-09)


### Features

* **config:** [#2011](https://github.com/s977043/river-review/issues/2011) AC7 P3-4 design role に Artifact Input Contract の ID を対応付ける ([#2199](https://github.com/s977043/river-review/issues/2199)) ([e935bb9](https://github.com/s977043/river-review/commit/e935bb928bf8e081a391eda13d9dcd05797a3410))

## [1.108.0](https://github.com/s977043/river-review/compare/v1.107.0...v1.108.0) (2026-09-09)


### Features

* **flow:** [#2011](https://github.com/s977043/river-review/issues/2011) AC7 P4 derive-gate を judgment 注入時のみ実行する ([#2192](https://github.com/s977043/river-review/issues/2192)) ([a358b16](https://github.com/s977043/river-review/commit/a358b162259621792211ce939b09bcf1d99d2159))

## [1.107.0](https://github.com/s977043/river-review/compare/v1.106.4...v1.107.0) (2026-09-09)


### Features

* **scripts:** heredoc サイズの機械検査を code hygiene へ追加する ([#2186](https://github.com/s977043/river-review/issues/2186)) ([00edc26](https://github.com/s977043/river-review/commit/00edc263beb731045e61bb1acdbf0f797c3d75ce))

## [1.106.4](https://github.com/s977043/river-review/compare/v1.106.3...v1.106.4) (2026-09-09)


### Bug Fixes

* **tests:** オプション語彙の走査でコメントを除外する ([#2183](https://github.com/s977043/river-review/issues/2183)) ([c4697ae](https://github.com/s977043/river-review/commit/c4697ae952b0b6ca60caf53ba1dab88c6e2fbb98))

## [1.106.3](https://github.com/s977043/river-review/compare/v1.106.2...v1.106.3) (2026-09-09)


### Bug Fixes

* **scripts:** pr-unstall の 422 出力を heredoc から printf へ変える ([#2172](https://github.com/s977043/river-review/issues/2172)) ([b142d35](https://github.com/s977043/river-review/commit/b142d357e28eb72ff058d4e68afff6967b7063da))

## [1.106.2](https://github.com/s977043/river-review/compare/v1.106.1...v1.106.2) (2026-09-09)


### Bug Fixes

* **scripts:** doc 列挙の実体を git の追跡対象に限定する ([#2165](https://github.com/s977043/river-review/issues/2165)) ([4ce4fb2](https://github.com/s977043/river-review/commit/4ce4fb23e7858ea5de12c41778ff8bbf78d84057))

## [1.106.1](https://github.com/s977043/river-review/compare/v1.106.0...v1.106.1) (2026-09-08)


### Bug Fixes

* **cli:** 存在しない明示 artifact が既定束縛に上書きされるのを止める ([#2160](https://github.com/s977043/river-review/issues/2160)) ([d72ecc7](https://github.com/s977043/river-review/commit/d72ecc7d516dd1ca75e0356e84e3aea3afa714b1)), closes [#2011](https://github.com/s977043/river-review/issues/2011)

## [1.106.0](https://github.com/s977043/river-review/compare/v1.105.0...v1.106.0) (2026-09-08)


### Features

* **cli:** [#2011](https://github.com/s977043/river-review/issues/2011) AC7 P3-3 停止理由を未束縛と束縛先なしに分ける ([#2158](https://github.com/s977043/river-review/issues/2158)) ([fe84717](https://github.com/s977043/river-review/commit/fe847177bb0706f010474f6d1ef7d9b45df01ef1))

## [1.105.0](https://github.com/s977043/river-review/compare/v1.104.4...v1.105.0) (2026-09-08)


### Features

* **cli:** [#2011](https://github.com/s977043/river-review/issues/2011) AC7 P3-1 Flow 入力の解決を --debug から切り離す ([#2155](https://github.com/s977043/river-review/issues/2155)) ([28cd3ee](https://github.com/s977043/river-review/commit/28cd3ee64be948e590e9bdc2c34a6e713e8c9c02))
* **cli:** [#2011](https://github.com/s977043/river-review/issues/2011) AC7 P3-2 標準 artifact ID を Flow 入力へ結ぶ既定値を入れる ([#2157](https://github.com/s977043/river-review/issues/2157)) ([0d57d28](https://github.com/s977043/river-review/commit/0d57d28fb80f719ce35348b91cd280a2889442c0))

## [1.104.4](https://github.com/s977043/river-review/compare/v1.104.3...v1.104.4) (2026-09-07)


### Bug Fixes

* **scripts:** merge-chain が最後の PR をマージした直後に落ちるのを止める ([#2148](https://github.com/s977043/river-review/issues/2148)) ([aefb587](https://github.com/s977043/river-review/commit/aefb5872a047c1410470de2d2346f6c4b3cafbe1))

## [1.104.3](https://github.com/s977043/river-review/compare/v1.104.2...v1.104.3) (2026-09-07)


### Bug Fixes

* **scripts:** hook command の実行対象を引用状態を追って抽出する ([#2145](https://github.com/s977043/river-review/issues/2145)) ([bb6dbe9](https://github.com/s977043/river-review/commit/bb6dbe9401a0280ec6a2ce0d1fdbfca9a009e89d))

## [1.104.2](https://github.com/s977043/river-review/compare/v1.104.1...v1.104.2) (2026-09-07)


### Bug Fixes

* **scripts:** checkpoint hook の剪定で SIGPIPE により 141 終了するのを止める ([#2142](https://github.com/s977043/river-review/issues/2142)) ([65aa523](https://github.com/s977043/river-review/commit/65aa523a2fb349b1d9e2884fbd9849ccf5a7abd0)), closes [#2135](https://github.com/s977043/river-review/issues/2135)

## [1.104.1](https://github.com/s977043/river-review/compare/v1.104.0...v1.104.1) (2026-09-07)


### Bug Fixes

* **scripts:** hook command の実行対象が plugin root を脱出したら検証で落とす ([#2136](https://github.com/s977043/river-review/issues/2136)) ([d4b27ee](https://github.com/s977043/river-review/commit/d4b27eedeb49b3876887ec7d052271ca7b159624))

## [1.104.0](https://github.com/s977043/river-review/compare/v1.103.0...v1.104.0) (2026-09-06)


### Features

* **cli:** [#2011](https://github.com/s977043/river-review/issues/2011) AC7 P2 review exec --entry で Flow を observe 実行し steps[] を artifact に付ける ([#2124](https://github.com/s977043/river-review/issues/2124)) ([036b0df](https://github.com/s977043/river-review/commit/036b0df7655c1563d95e8039629f0c57bb4939c5))
* **flow:** [#2011](https://github.com/s977043/river-review/issues/2011) AC7 P1 flow-runner の骨格を追加する（実行なし） ([#2123](https://github.com/s977043/river-review/issues/2123)) ([449435c](https://github.com/s977043/river-review/commit/449435c121246e191edc02d6b5bcfb840663c6d3))


### Bug Fixes

* [#2119](https://github.com/s977043/river-review/issues/2119) v1.103.0 範囲レビューの minor 10 件を解消する ([#2120](https://github.com/s977043/river-review/issues/2120)) ([1789de0](https://github.com/s977043/river-review/commit/1789de016b6149209503877c935a56d5ee716fe2))
* **scripts:** [#2117](https://github.com/s977043/river-review/issues/2117) hooks/hooks.json の script 実在検査を manifest 宣言なしでも走らせる ([#2122](https://github.com/s977043/river-review/issues/2122)) ([d14f84b](https://github.com/s977043/river-review/commit/d14f84bc07ab64f91e02f35ff51f0ede2013579d))

## [1.103.0](https://github.com/s977043/river-review/compare/v1.102.0...v1.103.0) (2026-09-05)


### Features

* **adapter:** [#2054](https://github.com/s977043/river-review/issues/2054) PR-5 entry 名を hook / Action input から渡し dist に flows と schema を同梱する ([#2117](https://github.com/s977043/river-review/issues/2117)) ([7d21f1a](https://github.com/s977043/river-review/commit/7d21f1a4630e22fdbdd22a768b714447b085407d))

## [1.102.0](https://github.com/s977043/river-review/compare/v1.101.0...v1.102.0) (2026-09-05)


### Features

* **cli:** [#2054](https://github.com/s977043/river-review/issues/2054) PR-4 run record と review artifact に Execution Manifest を配線する ([#2111](https://github.com/s977043/river-review/issues/2111)) ([9056304](https://github.com/s977043/river-review/commit/9056304a08341eb5065d8c4853a4ef39c1b73cdd))


### Bug Fixes

* **scripts:** [#2102](https://github.com/s977043/river-review/issues/2102) merge-chain.sh の読み取り失敗を exit 2 で止め false green を防ぐ ([#2109](https://github.com/s977043/river-review/issues/2109)) ([b838128](https://github.com/s977043/river-review/commit/b838128daee54c4cfc445a02493a4c36e6a44461))

## [1.101.0](https://github.com/s977043/river-review/compare/v1.100.0...v1.101.0) (2026-09-05)


### Features

* **cli:** [#2054](https://github.com/s977043/river-review/issues/2054) PR-3 flow-loader を新設し review plan --entry で Flow pin を載せる ([#2103](https://github.com/s977043/river-review/issues/2103)) ([b4fc00f](https://github.com/s977043/river-review/commit/b4fc00f0914aa48eff8e10531bf7bc8673007901))

## [1.100.0](https://github.com/s977043/river-review/compare/v1.99.3...v1.100.0) (2026-09-05)


### Features

* **flows:** [#2054](https://github.com/s977043/river-review/issues/2054) PR-1 trigger registry を entry-map に宣言のみ追加する ([#2093](https://github.com/s977043/river-review/issues/2093)) ([23ccc8a](https://github.com/s977043/river-review/commit/23ccc8abac83b9b5faa9f2876265464d00f750cf))
* **trigger:** [#2054](https://github.com/s977043/river-review/issues/2054) 工程イベントを Flow entry と pin へ解決する純関数 resolver を追加する ([#2092](https://github.com/s977043/river-review/issues/2092)) ([2b06f96](https://github.com/s977043/river-review/commit/2b06f963be7bdea3363c6ec4227b0d77b1491a40))


### Bug Fixes

* **cli:** [#2081](https://github.com/s977043/river-review/issues/2081) skills の後置サブコマンドを対象パスではなくサブコマンドとして解決する ([#2089](https://github.com/s977043/river-review/issues/2089)) ([e2e3eaf](https://github.com/s977043/river-review/commit/e2e3eaf62e88013f9e28cb024c0e76d559850eba))

## [1.99.3](https://github.com/s977043/river-review/compare/v1.99.2...v1.99.3) (2026-09-05)


### Bug Fixes

* **cli:** [#2076](https://github.com/s977043/river-review/issues/2076) --base 拒否メッセージに復旧手順を 1 文加える ([#2080](https://github.com/s977043/river-review/issues/2080)) ([86a20cd](https://github.com/s977043/river-review/commit/86a20cdfd4491cf498fc6918170f8aeaa229801a))
* **git:** [#2071](https://github.com/s977043/river-review/issues/2071) --base の警告を merge base の出所と一致させる ([#2079](https://github.com/s977043/river-review/issues/2079)) ([4742362](https://github.com/s977043/river-review/commit/4742362012a964b97e503784672d1a3da6b9fe95))

## [1.99.2](https://github.com/s977043/river-review/compare/v1.99.1...v1.99.2) (2026-09-05)


### Bug Fixes

* **cli:** [#2065](https://github.com/s977043/river-review/issues/2065) --base を読まない 14 面で usage error にする（exit 0/3 → 1）([#2073](https://github.com/s977043/river-review/issues/2073)) ([801760f](https://github.com/s977043/river-review/commit/801760f50893ea13c1452b2308460b2f18f70103))
* **git:** [#2067](https://github.com/s977043/river-review/issues/2067) --base が HEAD の子孫のときの誤診断を分岐する ([#2070](https://github.com/s977043/river-review/issues/2070)) ([3b9e29c](https://github.com/s977043/river-review/commit/3b9e29c141cdd9ffbeb6adc20cff5686de652e8c))

## [1.99.1](https://github.com/s977043/river-review/compare/v1.99.0...v1.99.1) (2026-09-04)


### Bug Fixes

* **scripts:** [#2055](https://github.com/s977043/river-review/issues/2055) 制御文字チェックの追跡 symlink 経由のリポジトリ外読み取りと無限ループを塞ぐ ([#2068](https://github.com/s977043/river-review/issues/2068)) ([63cb72d](https://github.com/s977043/river-review/commit/63cb72dd9c20c2042a905399604f02ed3fdddc6c))

## [1.99.0](https://github.com/s977043/river-review/compare/v1.98.0...v1.99.0) (2026-09-04)


### Features

* **scripts:** [#2055](https://github.com/s977043/river-review/issues/2055) ソースへの C0 制御文字混入を機械検査する ([#2062](https://github.com/s977043/river-review/issues/2062)) ([2961be8](https://github.com/s977043/river-review/commit/2961be861a4d864d514c860a1340299265ad88c1))


### Bug Fixes

* **cli:** [#2051](https://github.com/s977043/river-review/issues/2051) [#2057](https://github.com/s977043/river-review/issues/2057) --base を skills / run でも review と同じ経路で解決する ([#2064](https://github.com/s977043/river-review/issues/2064)) ([22da923](https://github.com/s977043/river-review/commit/22da923ee040974b9d07ce156641f5900c61f731))
* **scripts:** [#2058](https://github.com/s977043/river-review/issues/2058) [#2059](https://github.com/s977043/river-review/issues/2059) RA-1 の severity 対応表を向きまで照合し ADR-009 D7-4 の矛盾を解消する ([#2063](https://github.com/s977043/river-review/issues/2063)) ([02802a2](https://github.com/s977043/river-review/commit/02802a2a831906892794acacef2fb76fd767eb86))

## [1.98.0](https://github.com/s977043/river-review/compare/v1.97.1...v1.98.0) (2026-09-04)


### Features

* **scripts:** [#2027](https://github.com/s977043/river-review/issues/2027) Runtime Adapter Invariants RA-1 / RA-2 を機械検査へ落とす ([#2050](https://github.com/s977043/river-review/issues/2050)) ([2c53759](https://github.com/s977043/river-review/commit/2c537597e2c6e14ba90e1cee3ecfc60dbb0149fa))


### Bug Fixes

* **cli:** [#2046](https://github.com/s977043/river-review/issues/2046) review plan が --base を route と同じ経路で解決する ([#2049](https://github.com/s977043/river-review/issues/2049)) ([1dbe027](https://github.com/s977043/river-review/commit/1dbe0275cbf16d0d940bd1fe5f22406d14f536c5))
* **scripts:** [#2050](https://github.com/s977043/river-review/issues/2050) RA-1 の SSoT 参照 traversal と証跡規則の ReDoS を塞ぐ ([#2060](https://github.com/s977043/river-review/issues/2060)) ([de6995d](https://github.com/s977043/river-review/commit/de6995d9cf286f19ccef5670b8f1b4c014f53802))

## [1.97.1](https://github.com/s977043/river-review/compare/v1.97.0...v1.97.1) (2026-09-04)


### Bug Fixes

* **manifest:** [#2037](https://github.com/s977043/river-review/issues/2037) flow ブロックの resolve 経路を決めて deterministic replay を成立させる ([#2048](https://github.com/s977043/river-review/issues/2048)) ([b73d321](https://github.com/s977043/river-review/commit/b73d3213284a51bbd6e9e5ea0302c7646e75952d))

## [1.97.0](https://github.com/s977043/river-review/compare/v1.96.0...v1.97.0) (2026-09-03)


### Features

* [#2020](https://github.com/s977043/river-review/issues/2020) cross-runtime conformance kit を追加する ([#2045](https://github.com/s977043/river-review/issues/2045)) ([612f991](https://github.com/s977043/river-review/commit/612f9912fad6ab13db6d6186fa4301549127f977))

## [1.96.0](https://github.com/s977043/river-review/compare/v1.95.0...v1.96.0) (2026-09-03)


### Features

* **schemas:** [#2018](https://github.com/s977043/river-review/issues/2018) Cross-Artifact Consistency の契約と検証を追加する ([#2042](https://github.com/s977043/river-review/issues/2042)) ([84cd204](https://github.com/s977043/river-review/commit/84cd20414eea685abbae769f3e77f01cc32f0c24))
* **schemas:** [#2019](https://github.com/s977043/river-review/issues/2019) Completion / Convergence の契約と検証を追加する ([#2043](https://github.com/s977043/river-review/issues/2043)) ([c6c9a43](https://github.com/s977043/river-review/commit/c6c9a43439c81afc6bba6bf6651a15b85f2d4f80))

## [1.95.0](https://github.com/s977043/river-review/compare/v1.94.0...v1.95.0) (2026-09-03)


### Features

* **flows:** [#2017](https://github.com/s977043/river-review/issues/2017) 実装前の上流 4 レビューを Flow として定義する ([#2040](https://github.com/s977043/river-review/issues/2040)) ([f7da9b0](https://github.com/s977043/river-review/commit/f7da9b03dbc2022981c79f6aa4491d2a2decf6b6))

## [1.94.0](https://github.com/s977043/river-review/compare/v1.93.0...v1.94.0) (2026-09-03)


### Features

* **flows:** [#2016](https://github.com/s977043/river-review/issues/2016) 4 つの core review entry flow と Review Intent を定義する ([#2035](https://github.com/s977043/river-review/issues/2035)) ([48cf09f](https://github.com/s977043/river-review/commit/48cf09f7ef8010da2ff3e26064e3b4dea835f83a))

## [1.93.0](https://github.com/s977043/river-review/compare/v1.92.0...v1.93.0) (2026-09-03)


### Features

* **schemas:** [#2015](https://github.com/s977043/river-review/issues/2015) Execution Manifest と replay 可否判定を追加する ([#2032](https://github.com/s977043/river-review/issues/2032)) ([5f35f52](https://github.com/s977043/river-review/commit/5f35f522f64621f9370f4935ae353850e9d30cb6))

## [1.92.0](https://github.com/s977043/river-review/compare/v1.91.0...v1.92.0) (2026-09-03)


### Features

* **schemas:** [#2013](https://github.com/s977043/river-review/issues/2013) Review Flow Contract を flow.schema.json として追加する ([#2028](https://github.com/s977043/river-review/issues/2028)) ([681cff4](https://github.com/s977043/river-review/commit/681cff4573b34b30d49358cc1ec75300928bbccb))
* **schemas:** [#2014](https://github.com/s977043/river-review/issues/2014) Portable Review Agent Contract を追加する ([#2030](https://github.com/s977043/river-review/issues/2030)) ([25624d8](https://github.com/s977043/river-review/commit/25624d8cd90ba61e12bbfba4e53aa61a299124be))

## [1.91.0](https://github.com/s977043/river-review/compare/v1.90.0...v1.91.0) (2026-09-03)


### Features

* **scripts:** 語彙定数の直書きリテラルを検出する検査を追加する ([#2025](https://github.com/s977043/river-review/issues/2025)) ([3c98b0a](https://github.com/s977043/river-review/commit/3c98b0a2581a08b0967c6c5906800f0d7c23c5a6))

## [1.90.0](https://github.com/s977043/river-review/compare/v1.89.3...v1.90.0) (2026-09-03)


### Features

* **critic:** [#1978](https://github.com/s977043/river-review/issues/1978) 決定論の状態機械へ応答を供給する薄い runner を追加する ([#2021](https://github.com/s977043/river-review/issues/2021)) ([4304142](https://github.com/s977043/river-review/commit/43041420aad6b380d427f7ba3947330c4981a0d0))

## [1.89.3](https://github.com/s977043/river-review/compare/v1.89.2...v1.89.3) (2026-09-02)


### Bug Fixes

* **ci:** [#1415](https://github.com/s977043/river-review/issues/1415) test isolation フラグを npm script へ集約する ([#2005](https://github.com/s977043/river-review/issues/2005)) ([9525956](https://github.com/s977043/river-review/commit/9525956517e111dd48631d11201301a3f2f2fa8d))

## [1.89.2](https://github.com/s977043/river-review/compare/v1.89.1...v1.89.2) (2026-09-02)


### Bug Fixes

* **ci:** [#1997](https://github.com/s977043/river-review/issues/1997) Weekly GC のテスト実行を単一プロセス分離にそろえる ([#2002](https://github.com/s977043/river-review/issues/2002)) ([6ea345f](https://github.com/s977043/river-review/commit/6ea345f5b7cdd8fafc63c06fafc2c5640de0d7dd))

## [1.89.1](https://github.com/s977043/river-review/compare/v1.89.0...v1.89.1) (2026-08-28)


### Bug Fixes

* **scripts:** [#1982](https://github.com/s977043/river-review/issues/1982) draft-07 meta-schema をモジュール解決経由で取得する ([#1985](https://github.com/s977043/river-review/issues/1985)) ([26bc1c7](https://github.com/s977043/river-review/commit/26bc1c7929bc56c80684abe93383d0bb3f214736))

## [1.89.0](https://github.com/s977043/river-review/compare/v1.88.0...v1.89.0) (2026-08-26)


### Features

* **review:** [#1978](https://github.com/s977043/river-review/issues/1978) Phase 1a の決定論スケルトンを追加する ([#1981](https://github.com/s977043/river-review/issues/1981)) ([56e0ae4](https://github.com/s977043/river-review/commit/56e0ae4c4e03efd7f5b254fbe2eabde22edbd7c9))

## [1.88.0](https://github.com/s977043/river-review/compare/v1.87.6...v1.88.0) (2026-08-26)


### Features

* **evolve:** active の run を受け取る 2 系統の paired 比較経路を足す ([#1880](https://github.com/s977043/river-review/issues/1880)) ([#1974](https://github.com/s977043/river-review/issues/1974)) ([ba4b258](https://github.com/s977043/river-review/commit/ba4b2582ab52590a60d22e92a43e6484fc2f6d94))

## [1.87.6](https://github.com/s977043/river-review/compare/v1.87.5...v1.87.6) (2026-08-26)


### Bug Fixes

* **evolve:** paired replay の cross-side source_commit_sha 差異を報告する ([#1724](https://github.com/s977043/river-review/issues/1724)) ([#1968](https://github.com/s977043/river-review/issues/1968)) ([52143ee](https://github.com/s977043/river-review/commit/52143eeb076f5b21103d95688bd6c55671ef8eec))
* **suppression:** v2 抑制が統合元の行のコメントを取り逃す問題を直す ([#1823](https://github.com/s977043/river-review/issues/1823)) ([#1967](https://github.com/s977043/river-review/issues/1967)) ([67a6556](https://github.com/s977043/river-review/commit/67a6556fdc5c49d868066acb630043c557a8ebd2))

## [1.87.5](https://github.com/s977043/river-review/compare/v1.87.4...v1.87.5) (2026-08-24)


### Bug Fixes

* **cli:** --context の未知語彙を stderr で警告する ([#1759](https://github.com/s977043/river-review/issues/1759) C3) ([#1958](https://github.com/s977043/river-review/issues/1958)) ([375d769](https://github.com/s977043/river-review/commit/375d769a7cc8eb39249e73b546eae324e2c0a6cf))

## [1.87.4](https://github.com/s977043/river-review/compare/v1.87.3...v1.87.4) (2026-08-24)


### Bug Fixes

* **cli:** evolve prompt-compare で存在しないパスと観測ゼロを区別する ([#1948](https://github.com/s977043/river-review/issues/1948)) ([407d3e3](https://github.com/s977043/river-review/commit/407d3e3664fae9c1e2830547b16fafd8367cba33))
* **scripts:** 512B 超の heredoc を排除しテストの孤児プロセスを止める ([#1951](https://github.com/s977043/river-review/issues/1951)) ([8ac5ef4](https://github.com/s977043/river-review/commit/8ac5ef428edd340a1d78b09e46df094de568bdc7)), closes [#1950](https://github.com/s977043/river-review/issues/1950)

## [1.87.3](https://github.com/s977043/river-review/compare/v1.87.2...v1.87.3) (2026-08-20)


### Bug Fixes

* **cli:** 存在しない対象を黙って受理する経路に警告を出す ([#1945](https://github.com/s977043/river-review/issues/1945)) ([ef9c3fd](https://github.com/s977043/river-review/commit/ef9c3fd806c7061ad9b87711f30ef2ddf4d58df9))

## [1.87.2](https://github.com/s977043/river-review/compare/v1.87.1...v1.87.2) (2026-08-20)


### Bug Fixes

* **action:** サマリーの自己申告 Scope ラベルを SSoT 経由で除去する ([#1937](https://github.com/s977043/river-review/issues/1937)) ([7b771c0](https://github.com/s977043/river-review/commit/7b771c0de57a598f5bc58fd51d637f763a12ca42)), closes [#1929](https://github.com/s977043/river-review/issues/1929)
* evolve のサブコマンド語がディレクトリ名と衝突すると語順で意味が変わる問題を直す ([#1759](https://github.com/s977043/river-review/issues/1759) B1) ([#1932](https://github.com/s977043/river-review/issues/1932)) ([7fd4d60](https://github.com/s977043/river-review/commit/7fd4d6006495bc5026c30c0b04956f4487563b38))
* **types:** inputContext / outputKind の TypeScript 宣言を schema に揃え parity canary を広げる ([#1941](https://github.com/s977043/river-review/issues/1941)) ([9279b47](https://github.com/s977043/river-review/commit/9279b47d87179e4b2873c650512a1611988bc7c7))

## [1.87.1](https://github.com/s977043/river-review/compare/v1.87.0...v1.87.1) (2026-08-19)


### Bug Fixes

* **action:** サマリーの「指摘なし」判定を counts でなく finding 実体から行う ([#1927](https://github.com/s977043/river-review/issues/1927)) ([91a3583](https://github.com/s977043/river-review/commit/91a3583d7fdd3ef80a9d7d4a27fb268434bf2d85)), closes [#1915](https://github.com/s977043/river-review/issues/1915)
* evolve aggregate --month の月として不正な値を拒否する ([#1759](https://github.com/s977043/river-review/issues/1759) C4) ([#1923](https://github.com/s977043/river-review/issues/1923)) ([2d8c337](https://github.com/s977043/river-review/commit/2d8c3371b149a78b11c14b3aafa0c22f1eac87a7))
* **output:** 自己申告 Scope ラベルを解決済み scope の描画時に落とす ([#1925](https://github.com/s977043/river-review/issues/1925)) ([4dfc8e3](https://github.com/s977043/river-review/commit/4dfc8e32e6d60c86292b5f7085afcd1ab0f87181)), closes [#1915](https://github.com/s977043/river-review/issues/1915)
* 依存スタブ有効時に custom: 依存がスキップされる問題を直す ([#1921](https://github.com/s977043/river-review/issues/1921)) ([#1931](https://github.com/s977043/river-review/issues/1931)) ([f925b97](https://github.com/s977043/river-review/commit/f925b9738b815a476ae1d9fc3a50b3623cc04556))

## [1.87.0](https://github.com/s977043/river-review/compare/v1.86.0...v1.87.0) (2026-08-19)


### Features

* **action:** pre-existing の finding を PR コメントで折りたたむ ([#1918](https://github.com/s977043/river-review/issues/1918)) ([9942bf8](https://github.com/s977043/river-review/commit/9942bf86075fe2bdca48d50ac1e6ad7eacadf3ba))


### Bug Fixes

* **docs:** no-mix-dearu-desumasu を有効化し textlint config を統合する ([#1786](https://github.com/s977043/river-review/issues/1786) 段階2-d) ([#1924](https://github.com/s977043/river-review/issues/1924)) ([1f976bf](https://github.com/s977043/river-review/commit/1f976bf496fe913ce2bb89a096ecf3d3249420be))
* **docs:** sentence-length を docs textlint config で有効化する ([#1786](https://github.com/s977043/river-review/issues/1786) 段階2-c) ([#1919](https://github.com/s977043/river-review/issues/1919)) ([4c12d8d](https://github.com/s977043/river-review/commit/4c12d8d61c6661895f2763940ab8079e81fe79b5))

## [1.86.0](https://github.com/s977043/river-review/compare/v1.85.2...v1.86.0) (2026-08-18)


### Features

* **output:** finding の scope を YAML / HTML / Markdown へ届ける ([#1914](https://github.com/s977043/river-review/issues/1914)) ([5fc53b7](https://github.com/s977043/river-review/commit/5fc53b7cf14ac630fd43a18369827ba91cc9083e)), closes [#1644](https://github.com/s977043/river-review/issues/1644)


### Bug Fixes

* **docs:** enable no-doubled-joshi in docs textlint config ([#1786](https://github.com/s977043/river-review/issues/1786) stage 2-b) ([#1916](https://github.com/s977043/river-review/issues/1916)) ([ad26d8a](https://github.com/s977043/river-review/commit/ad26d8a73c5c07d3f077218b1d25f4916aaa85d5))

## [1.85.2](https://github.com/s977043/river-review/compare/v1.85.1...v1.85.2) (2026-08-18)


### Bug Fixes

* **cli:** RIVER_PHASE を --phase と同じ検証・語彙で受理する ([#1759](https://github.com/s977043/river-review/issues/1759) C2) ([#1911](https://github.com/s977043/river-review/issues/1911)) ([cf697ac](https://github.com/s977043/river-review/commit/cf697ac093db66c91ea36a28b2276a4aed533d5f))

## [1.85.1](https://github.com/s977043/river-review/compare/v1.85.0...v1.85.1) (2026-08-18)


### Bug Fixes

* **cli:** runs diff がオプションを run ID として飲み込む問題を直す ([#1910](https://github.com/s977043/river-review/issues/1910)) ([77318d8](https://github.com/s977043/river-review/commit/77318d8b71dbdf28c05e11c5be7c0c4d9ea8e7e6))
* **textlint:** docs/** の prh を有効化し語境界を厳格化する ([#1786](https://github.com/s977043/river-review/issues/1786) 段階2-a) ([#1907](https://github.com/s977043/river-review/issues/1907)) ([ee8fb1c](https://github.com/s977043/river-review/commit/ee8fb1ca00a310da663b3bd3f15b81dbc2348112))

## [1.85.0](https://github.com/s977043/river-review/compare/v1.84.2...v1.85.0) (2026-08-18)


### Features

* **skills:** 検査器そのものの検出力を検証する detector-detection-power を追加 ([#1903](https://github.com/s977043/river-review/issues/1903)) ([52bbb54](https://github.com/s977043/river-review/commit/52bbb549f72473d550b8cb30c9f7056ad6496202))

## [1.84.2](https://github.com/s977043/river-review/compare/v1.84.1...v1.84.2) (2026-08-18)


### Bug Fixes

* **result-store:** ncc の asset 誤変換で出荷 Action が run record を読めない不具合を直す ([#1902](https://github.com/s977043/river-review/issues/1902)) ([5107450](https://github.com/s977043/river-review/commit/51074501097c1e4193e250793337e5c7a121bebe)), closes [#1900](https://github.com/s977043/river-review/issues/1900)

## [1.84.1](https://github.com/s977043/river-review/compare/v1.84.0...v1.84.1) (2026-08-18)


### Bug Fixes

* **scripts:** dist に焼き込まれる作業ディレクトリ名を正規化する ([#1898](https://github.com/s977043/river-review/issues/1898)) ([b20a015](https://github.com/s977043/river-review/commit/b20a01573dd11360e12cfd377b9abfa0055e4506))

## [1.84.0](https://github.com/s977043/river-review/compare/v1.83.0...v1.84.0) (2026-08-18)


### Features

* **meta:** guard 台帳を期限付きの決定全般へ広げる ([#1895](https://github.com/s977043/river-review/issues/1895)) ([b8dd84f](https://github.com/s977043/river-review/commit/b8dd84f33c7b0e8722c774fba2557f8a35149b20)), closes [#1843](https://github.com/s977043/river-review/issues/1843)


### Bug Fixes

* **review-team:** マージ時に scope を fail-safe 合成し in-diff を優先表示する ([#1894](https://github.com/s977043/river-review/issues/1894)) ([46701eb](https://github.com/s977043/river-review/commit/46701eb3ba43094c11af3d33c1f1dabc51ce9ce5)), closes [#1644](https://github.com/s977043/river-review/issues/1644)

## [1.83.0](https://github.com/s977043/river-review/compare/v1.82.0...v1.83.0) (2026-08-15)


### Features

* **feedback:** 未一致 findingFingerprint を無言にせず報告する ([#1883](https://github.com/s977043/river-review/issues/1883)) ([4f42ed4](https://github.com/s977043/river-review/commit/4f42ed49cde18eefd9125ca1fe3812fc3d04191e)), closes [#1823](https://github.com/s977043/river-review/issues/1823)

## [1.82.0](https://github.com/s977043/river-review/compare/v1.81.0...v1.82.0) (2026-08-15)


### Features

* **prompt-compiler:** compiled prompt の opt-in active モードを配線する ([#1878](https://github.com/s977043/river-review/issues/1878)) ([10d8c5b](https://github.com/s977043/river-review/commit/10d8c5b6dca681bce8775ed709389c35855bc609)), closes [#1861](https://github.com/s977043/river-review/issues/1861) [#1858](https://github.com/s977043/river-review/issues/1858)
* **skills:** fixture diff パーサの記法・構造カバレッジを広げる ([#1877](https://github.com/s977043/river-review/issues/1877)) ([a138037](https://github.com/s977043/river-review/commit/a138037ccd8e2aee187a4751288c177125057bec)), closes [#1856](https://github.com/s977043/river-review/issues/1856)

## [1.81.0](https://github.com/s977043/river-review/compare/v1.80.0...v1.81.0) (2026-08-15)


### Features

* **skills:** plangate-plan-integrity に正規化順序欠陥の fixture を 1 対追加する ([#1875](https://github.com/s977043/river-review/issues/1875)) ([9ff338b](https://github.com/s977043/river-review/commit/9ff338bd7222ad551ed5039a6088b15129d83f59)), closes [#1869](https://github.com/s977043/river-review/issues/1869)

## [1.80.0](https://github.com/s977043/river-review/compare/v1.79.0...v1.80.0) (2026-08-15)


### Features

* **eval:** legacy と compiled の paired 比較導線を足す ([#1873](https://github.com/s977043/river-review/issues/1873)) ([077a056](https://github.com/s977043/river-review/commit/077a056d2f056eb8e848844fa41e7fcfbca61fde)), closes [#1860](https://github.com/s977043/river-review/issues/1860) [#1858](https://github.com/s977043/river-review/issues/1858)


### Bug Fixes

* **review-plan:** replay / exec で engine の debug.execution 観測を引き継ぐ ([#1871](https://github.com/s977043/river-review/issues/1871)) ([5f3f0ec](https://github.com/s977043/river-review/commit/5f3f0ec3e6b390012058ec7e538ca73e41f03d28)), closes [#1868](https://github.com/s977043/river-review/issues/1868) [#1858](https://github.com/s977043/river-review/issues/1858)

## [1.79.0](https://github.com/s977043/river-review/compare/v1.78.1...v1.79.0) (2026-08-15)


### Features

* **prompt:** モデル非依存の Prompt Compiler を observe モードで導入する ([#1867](https://github.com/s977043/river-review/issues/1867)) ([10aa7dc](https://github.com/s977043/river-review/commit/10aa7dc18f892e0c762575a0f978999f5e7a0fa9))

## [1.78.1](https://github.com/s977043/river-review/compare/v1.78.0...v1.78.1) (2026-08-15)


### Bug Fixes

* **scripts:** call site 走査器が正規表現内の引用符で検出漏れする不具合を直す ([#1864](https://github.com/s977043/river-review/issues/1864)) ([72e5557](https://github.com/s977043/river-review/commit/72e5557cbef9f5e73d9470f578ddf4a20d1a4942))

## [1.78.0](https://github.com/s977043/river-review/compare/v1.77.0...v1.78.0) (2026-08-14)


### Features

* **skills:** fixture の diff 構造を検証するゲートを追加する ([#1854](https://github.com/s977043/river-review/issues/1854)) ([cac1916](https://github.com/s977043/river-review/commit/cac191604dec40de34c7df0158ac307cf4d6f61a))

## [1.77.0](https://github.com/s977043/river-review/compare/v1.76.2...v1.77.0) (2026-08-13)


### Features

* **skills:** fixtures 第 4 波で S1 免除リストを空にする ([#1850](https://github.com/s977043/river-review/issues/1850)) ([2cf4697](https://github.com/s977043/river-review/commit/2cf4697f8ebeb0d3a0004cfba01c4bbacb3c9148))

## [1.76.2](https://github.com/s977043/river-review/compare/v1.76.1...v1.76.2) (2026-08-13)


### Bug Fixes

* **docs:** 配布サーフェスの README 列挙を実測へ合わせ機械検証を足す ([#1847](https://github.com/s977043/river-review/issues/1847)) ([6bca5e2](https://github.com/s977043/river-review/commit/6bca5e2479c467917a8fc76ce9ef29ca4cfceccc))
* **scripts:** 複数フェーズのスキルがカタログから無言で落ちる不具合を修正する ([#1846](https://github.com/s977043/river-review/issues/1846)) ([cfe0cdf](https://github.com/s977043/river-review/commit/cfe0cdfe304a71ac320ee1bfb36e1da08bc34a7e))

## [1.76.1](https://github.com/s977043/river-review/compare/v1.76.0...v1.76.1) (2026-08-12)


### Bug Fixes

* **scripts:** count-in-clean-tree.sh の SIGPIPE 失敗を中間ファイルで解消する ([#1839](https://github.com/s977043/river-review/issues/1839)) ([52c0556](https://github.com/s977043/river-review/commit/52c0556e3e3cdf7e1eb894da7cf4c1a5217b745a))

## [1.76.0](https://github.com/s977043/river-review/compare/v1.75.0...v1.76.0) (2026-08-12)


### Features

* **scripts:** レビューコメントの未 disposition 検出を機械化する ([#1833](https://github.com/s977043/river-review/issues/1833)) ([0c4facd](https://github.com/s977043/river-review/commit/0c4facd30a99e179e053fbd1ad9390be775aab65)), closes [#1827](https://github.com/s977043/river-review/issues/1827)

## [1.75.0](https://github.com/s977043/river-review/compare/v1.74.0...v1.75.0) (2026-08-12)


### Features

* **meta:** pipeline call site チェックリストを機械照合する ([#1831](https://github.com/s977043/river-review/issues/1831)) ([7584633](https://github.com/s977043/river-review/commit/7584633b6f527eb23c2e6cc2c6a1b2aba75dfa51)), closes [#1827](https://github.com/s977043/river-review/issues/1827)
* **scripts:** clean tree で件数を計測する count-in-clean-tree.sh を追加 ([#1828](https://github.com/s977043/river-review/issues/1828)) ([12f97ea](https://github.com/s977043/river-review/commit/12f97eaa7a4a98450d1efacbd1783d145ee8c2c9))

## [1.74.0](https://github.com/s977043/river-review/compare/v1.73.2...v1.74.0) (2026-08-12)


### Features

* **guards:** ガード台帳と退役工程を導入し必須チェックで機械保証する ([#1821](https://github.com/s977043/river-review/issues/1821)) ([ea2842a](https://github.com/s977043/river-review/commit/ea2842abc7581597d195f273ee667c898faec58d))
* **suppression:** 行番号込みの fingerprint v2 を併存追加する ([#1817](https://github.com/s977043/river-review/issues/1817)) ([24fa70e](https://github.com/s977043/river-review/commit/24fa70ee2ee319d553f04f980dde107f5a7a5d5d))


### Bug Fixes

* **ci:** nightly-eval の KPI 台帳を run 間で永続化して回帰検知を発火させる ([#1820](https://github.com/s977043/river-review/issues/1820)) ([8a4fc72](https://github.com/s977043/river-review/commit/8a4fc729054d103afeaaedcac13fdcfac01cbe5c))

## [1.73.2](https://github.com/s977043/river-review/compare/v1.73.1...v1.73.2) (2026-08-12)


### Bug Fixes

* **review:** looksLikeTestFile が e2e/ cypress/ 慣習のテストファイルを認識するようにする ([#1808](https://github.com/s977043/river-review/issues/1808)) ([4acee6d](https://github.com/s977043/river-review/commit/4acee6d2d53dccb33e122fb90ef65c901043e8f6)), closes [#1797](https://github.com/s977043/river-review/issues/1797)
* **review:** 恒久宣言付きの一時対応コメントを temporary-without-exit の許容へ加える ([#1811](https://github.com/s977043/river-review/issues/1811)) ([37e368e](https://github.com/s977043/river-review/commit/37e368e9130cbbe970d89c0b1880e5dc053fc94f))
* **suppression:** 本番レビュー経路で期限切れ suppression を無効化する ([#1810](https://github.com/s977043/river-review/issues/1810)) ([9378061](https://github.com/s977043/river-review/commit/937806160c60d1951cd07fabfb57fe2af545de23)), closes [#1802](https://github.com/s977043/river-review/issues/1802)

## [1.73.1](https://github.com/s977043/river-review/compare/v1.73.0...v1.73.1) (2026-08-12)


### Bug Fixes

* **lint:** 新 textlint config と .textlintignore を検出器と分類器の対象に含める ([#1806](https://github.com/s977043/river-review/issues/1806)) ([2d01158](https://github.com/s977043/river-review/commit/2d01158adecb3a6f8dd6cfe925a9d882522f55e3)), closes [#1786](https://github.com/s977043/river-review/issues/1786)
* **suppression:** unparseable な context.expiresAt を警告経路に載せる ([#1801](https://github.com/s977043/river-review/issues/1801)) ([d2c13f4](https://github.com/s977043/river-review/commit/d2c13f495d02062b2ac4a4ff73868f53758280b2)), closes [#1780](https://github.com/s977043/river-review/issues/1780)

## [1.73.0](https://github.com/s977043/river-review/compare/v1.72.5...v1.73.0) (2026-08-10)


### Features

* **review:** 一時対応コメントの撤去条件欠落を検出する決定論検出器を追加する ([#1788](https://github.com/s977043/river-review/issues/1788)) ([41785b2](https://github.com/s977043/river-review/commit/41785b2af9c562ef2b45e49fda47d4b52d60c228)), closes [#1783](https://github.com/s977043/river-review/issues/1783)

## [1.72.5](https://github.com/s977043/river-review/compare/v1.72.4...v1.72.5) (2026-08-06)


### Bug Fixes

* **ci:** blocked-label-guard の concurrency を外し cancelled な check-run の残留を止める ([#1787](https://github.com/s977043/river-review/issues/1787)) ([4cdf573](https://github.com/s977043/river-review/commit/4cdf573abeebebc23c1b31cfcb21c6b572cbf3ce))

## [1.72.4](https://github.com/s977043/river-review/compare/v1.72.3...v1.72.4) (2026-08-05)


### Bug Fixes

* **ci:** dist-check の base を PR マージコミットの第 1 親から解決する ([#1776](https://github.com/s977043/river-review/issues/1776)) ([1002efa](https://github.com/s977043/river-review/commit/1002efae09e77cdbd2d1792144e7582ea6e28cc4)), closes [#1775](https://github.com/s977043/river-review/issues/1775)
* **memory:** expiresAt の妥当性定義を CLI と共有する SSoT に統一する ([#1777](https://github.com/s977043/river-review/issues/1777)) ([d201a4c](https://github.com/s977043/river-review/commit/d201a4c9f43dcc83251fe205c83ec12ef38412ad)), closes [#1768](https://github.com/s977043/river-review/issues/1768)

## [1.72.3](https://github.com/s977043/river-review/compare/v1.72.2...v1.72.3) (2026-08-04)


### Bug Fixes

* **ci:** dist のバイト比較を untracked chunk まで見るようにし docs の断定を外す ([#1774](https://github.com/s977043/river-review/issues/1774)) ([0c27ff8](https://github.com/s977043/river-review/commit/0c27ff84c4a4251e2351131e938e8c255c544be0))
* **ci:** dist を触る変更で Action dist freshness の検証をスキップさせない ([#1773](https://github.com/s977043/river-review/issues/1773)) ([3066646](https://github.com/s977043/river-review/commit/306664669818dd33f4d6ae68b0b934436ddc8381)), closes [#1749](https://github.com/s977043/river-review/issues/1749)
* **cli:** review のサブコマンド後置を解決し POSIX `--` 終端を復旧する ([#1761](https://github.com/s977043/river-review/issues/1761)) ([ddca181](https://github.com/s977043/river-review/commit/ddca18105dd65a8a81530c814f3852d2e68d7123)), closes [#1755](https://github.com/s977043/river-review/issues/1755) [#1759](https://github.com/s977043/river-review/issues/1759)
* **cli:** 敵対的レビューの major 5 件 / minor 2 件 / W-4 に対応する ([#1769](https://github.com/s977043/river-review/issues/1769)) ([0f1799c](https://github.com/s977043/river-review/commit/0f1799ceb5b02f31cf8fe7ddef5200c31c37b652)), closes [#1755](https://github.com/s977043/river-review/issues/1755) [#1759](https://github.com/s977043/river-review/issues/1759)
* **memory:** isExpired の unparseable 時の向きを呼び出し元が選べるようにする ([#1762](https://github.com/s977043/river-review/issues/1762)) ([c35008f](https://github.com/s977043/river-review/commit/c35008f6e63eed2d08fc1e87cff3c447cf9cdc09))
* **scripts:** suppression-analytics の失効判定を isSuppressionExpired に委譲する ([#1772](https://github.com/s977043/river-review/issues/1772)) ([ce74e8a](https://github.com/s977043/river-review/commit/ce74e8ad616a1c6c80a463d1bafbc33bbb0fd301)), closes [#1764](https://github.com/s977043/river-review/issues/1764)

## [1.72.2](https://github.com/s977043/river-review/compare/v1.72.1...v1.72.2) (2026-08-04)


### Bug Fixes

* **cli:** 敵対的レビュー B1 / M2 / M3 に対応する ([#1757](https://github.com/s977043/river-review/issues/1757)) ([53c9022](https://github.com/s977043/river-review/commit/53c9022443f386d56421df94193cd7ab39531101))

## [1.72.1](https://github.com/s977043/river-review/compare/v1.72.0...v1.72.1) (2026-08-04)


### Bug Fixes

* **cli:** v1.72.0 の回帰 3 件（パス後置の拒否・値検証欠落・doc の過大表明）を修正する ([#1753](https://github.com/s977043/river-review/issues/1753)) ([aaaa6a2](https://github.com/s977043/river-review/commit/aaaa6a254c1327edd59b828ba566e2334ba02bbb))

## [1.72.0](https://github.com/s977043/river-review/compare/v1.71.1...v1.72.0) (2026-08-04)


### Features

* **cli:** usage error の C1 経路を strict parse で exit 1 に統一する（[#1709](https://github.com/s977043/river-review/issues/1709) Slice 3） ([#1746](https://github.com/s977043/river-review/issues/1746)) ([2983502](https://github.com/s977043/river-review/commit/29835029863ef4cc6ff64c0fe413a344c801cd8b))

## [1.71.1](https://github.com/s977043/river-review/compare/v1.71.0...v1.71.1) (2026-08-04)


### Bug Fixes

* **deps:** セキュリティアラート 5 件を lockfile 更新で解消する ([#1747](https://github.com/s977043/river-review/issues/1747)) ([4e58fa5](https://github.com/s977043/river-review/commit/4e58fa5ef93a9f66e74efc10934a7159581b9593))

## [1.71.0](https://github.com/s977043/river-review/compare/v1.70.0...v1.71.0) (2026-08-02)


### Features

* **cli:** usage error の exit code を exit 1 + stderr 要約に統一する（[#1709](https://github.com/s977043/river-review/issues/1709) Slice 2） ([#1735](https://github.com/s977043/river-review/issues/1735)) ([17b1212](https://github.com/s977043/river-review/commit/17b121290f267c005df0a063793dcb3203af88de))
* **scripts:** 公開ページの sidebar 到達性契約を機械検証する check-sidebar-reachability を追加する ([#1736](https://github.com/s977043/river-review/issues/1736)) ([7c87727](https://github.com/s977043/river-review/commit/7c8772705578ce8fc9bbd15a25047b9ec9b9bd07))

## [1.70.0](https://github.com/s977043/river-review/compare/v1.69.0...v1.70.0) (2026-08-02)


### Features

* **hooks:** force 系の破壊的 git コマンドを PreToolUse フックで阻止する ([#1733](https://github.com/s977043/river-review/issues/1733)) ([a9d9749](https://github.com/s977043/river-review/commit/a9d9749f8bd1ce5b6d1e7e82847a0c48e0b2c8db))
* **scripts:** .github/workflows/README.md のワークフロー一覧を doc-enum spec に登録する ([#1732](https://github.com/s977043/river-review/issues/1732)) ([2aee6be](https://github.com/s977043/river-review/commit/2aee6beefff05334f0ecb5e118b982ecce79eab0)), closes [#1728](https://github.com/s977043/river-review/issues/1728)

## [1.69.0](https://github.com/s977043/river-review/compare/v1.68.1...v1.69.0) (2026-08-02)


### Features

* **scripts:** ドキュメントの列挙・件数を機械検証する check-doc-enumerations を追加する ([#1726](https://github.com/s977043/river-review/issues/1726)) ([d984cae](https://github.com/s977043/river-review/commit/d984caec85eb20d2a36f5832053f737ff8107794))

## [1.68.1](https://github.com/s977043/river-review/compare/v1.68.0...v1.68.1) (2026-08-02)


### Bug Fixes

* **cli:** feedback add のオプション値を parse 時に検証する ([#1721](https://github.com/s977043/river-review/issues/1721)) ([26ad58c](https://github.com/s977043/river-review/commit/26ad58c9e6a99c0b4959d8a1bc89b9516f323146)), closes [#1717](https://github.com/s977043/river-review/issues/1717)
* **evolve:** paired replay の evidence 内部で source_commit_sha の一貫性を検査する ([#1720](https://github.com/s977043/river-review/issues/1720)) ([2e1192c](https://github.com/s977043/river-review/commit/2e1192c36173207961c52523be397cb379bed585))

## [1.68.0](https://github.com/s977043/river-review/compare/v1.67.1...v1.68.0) (2026-07-31)


### Features

* **output:** レビュー結果の人間向けサマリーを先頭に固定し段階的に開示する ([#1716](https://github.com/s977043/river-review/issues/1716)) ([ad651c0](https://github.com/s977043/river-review/commit/ad651c01e039941069e86ab580f178a996ac24c8))
* **runs:** run record に commitSha と provenance を書き証拠をコミットに紐づける ([#1718](https://github.com/s977043/river-review/issues/1718)) ([f7638e8](https://github.com/s977043/river-review/commit/f7638e8be32c6c27950f78df0173df717b4d0aa5))


### Bug Fixes

* **cli:** skills のバナー/進捗行と --baseline サマリを stderr へ回す ([#1711](https://github.com/s977043/river-review/issues/1711)) ([5632a0a](https://github.com/s977043/river-review/commit/5632a0a141e125048dca0ef1a53443159bc0eb8a)), closes [#1705](https://github.com/s977043/river-review/issues/1705) [#1706](https://github.com/s977043/river-review/issues/1706)

## [1.67.1](https://github.com/s977043/river-review/compare/v1.67.0...v1.67.1) (2026-07-31)


### Bug Fixes

* **cli:** --output html で実行ヘッダーを stderr へ回す ([#1703](https://github.com/s977043/river-review/issues/1703)) ([c9d5217](https://github.com/s977043/river-review/commit/c9d521764e6de814d2b61c792bca9fab52334ef6)), closes [#1695](https://github.com/s977043/river-review/issues/1695)
* **schema:** teamLeadReport と consensusLevel / reviewerRole を output.schema.json に宣言する ([#1704](https://github.com/s977043/river-review/issues/1704)) ([f61de97](https://github.com/s977043/river-review/commit/f61de97c9f94a767e809567af1ef0633af53ea82)), closes [#1700](https://github.com/s977043/river-review/issues/1700)

## [1.67.0](https://github.com/s977043/river-review/compare/v1.66.1...v1.67.0) (2026-07-31)


### Features

* **review:** finding 確定前に指摘行周辺の設計意図コメントを確認する ([#1697](https://github.com/s977043/river-review/issues/1697)) ([288f39f](https://github.com/s977043/river-review/commit/288f39fdde1d1a16f6555abf0ea704643935dfc4))
* **review:** 並列ロールレビューに進捗出力とロール単位タイムアウトを追加する ([#1696](https://github.com/s977043/river-review/issues/1696)) ([1389ae6](https://github.com/s977043/river-review/commit/1389ae606e55b589d7a2ad3b60dc2746ad866e4b))
* **skills:** テストのアサーション有効性（常に PASS する検証）を検出する skill を追加する ([#1698](https://github.com/s977043/river-review/issues/1698)) ([c2b270a](https://github.com/s977043/river-review/commit/c2b270af602c68b6ef3a10e5ffbcf84b710d34ca)), closes [#1684](https://github.com/s977043/river-review/issues/1684)

## [1.66.1](https://github.com/s977043/river-review/compare/v1.66.0...v1.66.1) (2026-07-31)


### Bug Fixes

* **deps:** brace-expansion を修正版に更新して DoS アラート ([#119](https://github.com/s977043/river-review/issues/119)) を解消する ([#1691](https://github.com/s977043/river-review/issues/1691)) ([b5ddd9e](https://github.com/s977043/river-review/commit/b5ddd9ed350e57d5c47259be1ced98ffc3f8fda4))

## [1.66.0](https://github.com/s977043/river-review/compare/v1.65.0...v1.66.0) (2026-07-31)


### Features

* **feedback:** river feedback add --run-id で review_run_id を書き join を成立させる ([#1681](https://github.com/s977043/river-review/issues/1681)) ([ddd47f0](https://github.com/s977043/river-review/commit/ddd47f05a427def7c27834911fc0a3f3818c73c2))
* **review:** finding に criterionRefs / artifactRefs を additive に追加する ([#1682](https://github.com/s977043/river-review/issues/1682)) ([5bc6e5b](https://github.com/s977043/river-review/commit/5bc6e5b9df73782b7c1e47dccdc37c9e5746a135))

## [1.65.0](https://github.com/s977043/river-review/compare/v1.64.0...v1.65.0) (2026-07-30)


### Features

* **skills:** review-criteria-integrity 観点でレビュー基準の自己弱体化を検出する ([#1674](https://github.com/s977043/river-review/issues/1674)) ([a1ce3ff](https://github.com/s977043/river-review/commit/a1ce3ff42db407fcf47ca83341532305787f0dfc)), closes [#1669](https://github.com/s977043/river-review/issues/1669)

## [1.64.0](https://github.com/s977043/river-review/compare/v1.63.0...v1.64.0) (2026-07-25)


### Features

* **evolve:** paired replay と immutable Experiment Manifest を追加する ([#1574](https://github.com/s977043/river-review/issues/1574) P2) ([#1656](https://github.com/s977043/river-review/issues/1656)) ([0993f63](https://github.com/s977043/river-review/commit/0993f6372d1612deb9dcaf6165a90ae579ae1b85))


### Bug Fixes

* **evolve:** paired replay の clusterKey 正規化を propose と共有し range レビュー指摘を修正する ([#1658](https://github.com/s977043/river-review/issues/1658)) ([28963f5](https://github.com/s977043/river-review/commit/28963f5b973ba2924a045ea0554bdfa3d839be32)), closes [#1574](https://github.com/s977043/river-review/issues/1574)

## [1.63.0](https://github.com/s977043/river-review/compare/v1.62.0...v1.63.0) (2026-07-25)


### Features

* **evolve:** [#1574](https://github.com/s977043/river-review/issues/1574) P1 の read-only shadow aggregate を追加する ([#1650](https://github.com/s977043/river-review/issues/1650)) ([93b1aaa](https://github.com/s977043/river-review/commit/93b1aaa1156dc7de85d7f95d5a974abe4fbfd49b))
* **promote:** river promote propose を追加し candidate ID を content hash 化する ([#1649](https://github.com/s977043/river-review/issues/1649)) ([0d02114](https://github.com/s977043/river-review/commit/0d02114bfed1240930a75f9eb9044e0412633022))
* **review:** finding に scope（in-diff / pre-existing）を additive に追加する ([#1648](https://github.com/s977043/river-review/issues/1648)) ([bda11e7](https://github.com/s977043/river-review/commit/bda11e7a0d903f059381b48ea3b4b99670570774))


### Bug Fixes

* **evolve:** [#1574](https://github.com/s977043/river-review/issues/1574) range レビュー指摘に対応する（hash 再導出・shadow→propose 接続・命名・CLI 堅牢性） ([#1652](https://github.com/s977043/river-review/issues/1652)) ([7c08e12](https://github.com/s977043/river-review/commit/7c08e1282055e259ab3e1c5a0eaed4a3680ff385))

## [1.62.0](https://github.com/s977043/river-review/compare/v1.61.1...v1.62.0) (2026-07-23)


### Features

* **review:** 不可視 Unicode コード注入（GlassWorm型）検出を追加する ([#1642](https://github.com/s977043/river-review/issues/1642)) ([8792a4f](https://github.com/s977043/river-review/commit/8792a4fd402661b9a174fe95914a120945a23f70)), closes [#1631](https://github.com/s977043/river-review/issues/1631)
* **riverbed:** promotion_candidate の Retire lifecycle 自動遷移 (Phase 3, [#1568](https://github.com/s977043/river-review/issues/1568)-C) ([#1641](https://github.com/s977043/river-review/issues/1641)) ([9373ef0](https://github.com/s977043/river-review/commit/9373ef09f8e255fa3ec99eede669cbc4e9334c8c))

## [1.61.1](https://github.com/s977043/river-review/compare/v1.61.0...v1.61.1) (2026-07-22)


### Bug Fixes

* **deps:** bump brace-expansion to 5.0.7 for GHSA advisory (alert [#103](https://github.com/s977043/river-review/issues/103)) ([#1632](https://github.com/s977043/river-review/issues/1632)) ([56818ba](https://github.com/s977043/river-review/commit/56818ba146019f15f00da448ff5bdbcbf8520e36))

## [1.61.0](https://github.com/s977043/river-review/compare/v1.60.0...v1.61.0) (2026-07-20)


### Features

* **cli:** promotion_candidate の承認 CLI と PR 雛形生成 (Phase 2, [#1568](https://github.com/s977043/river-review/issues/1568)-B) ([#1629](https://github.com/s977043/river-review/issues/1629)) ([c3ddd01](https://github.com/s977043/river-review/commit/c3ddd01dc2589a0f0fd3ac4730533e7389cd6029))

## [1.60.0](https://github.com/s977043/river-review/compare/v1.59.1...v1.60.0) (2026-07-20)


### Features

* **cli:** observe-mode phase inference recorded on plan snapshot ([#1626](https://github.com/s977043/river-review/issues/1626)) ([e2e7efd](https://github.com/s977043/river-review/commit/e2e7efd86c6070fca43963ac6d438f182bad97f9)), closes [#1565](https://github.com/s977043/river-review/issues/1565)
* **riverbed:** add promotion_candidate schema and structured候補生成 (Phase 1) ([#1627](https://github.com/s977043/river-review/issues/1627)) ([174a458](https://github.com/s977043/river-review/commit/174a458a0fc2a7144c043873e21a6c742dd766d4)), closes [#1621](https://github.com/s977043/river-review/issues/1621)

## [1.59.1](https://github.com/s977043/river-review/compare/v1.59.0...v1.59.1) (2026-07-19)


### Bug Fixes

* **skills:** a-2/a-4 の 6 スキルを diff/fullFile 供給集合内に収め発火可能にする ([#1618](https://github.com/s977043/river-review/issues/1618)) ([686fcae](https://github.com/s977043/river-review/commit/686fcae443efb5a03ffad9bf8a73415ab1523416)), closes [#1606](https://github.com/s977043/river-review/issues/1606)

## [1.59.0](https://github.com/s977043/river-review/compare/v1.58.0...v1.59.0) (2026-07-19)


### Features

* **runner:** supply fullFile context for changed source files (Refs [#1606](https://github.com/s977043/river-review/issues/1606)) ([#1609](https://github.com/s977043/river-review/issues/1609)) ([84fdcd5](https://github.com/s977043/river-review/commit/84fdcd52d7a3e1664298f3c6c24dd00c9758aa32))


### Bug Fixes

* **skills:** 冗長な adr を inputContext から外し a-1 の 14 スキルを発火可能にする ([#1607](https://github.com/s977043/river-review/issues/1607)) ([6e21e08](https://github.com/s977043/river-review/commit/6e21e0873d47dcfc97cc7f8ad8059a2d6c2d9c7c)), closes [#1606](https://github.com/s977043/river-review/issues/1606)

## [1.58.0](https://github.com/s977043/river-review/compare/v1.57.2...v1.58.0) (2026-07-19)


### Features

* **ci:** review run debug JSON を CI artifact として観測可能にする ([#1601](https://github.com/s977043/river-review/issues/1601)) ([94843d1](https://github.com/s977043/river-review/commit/94843d1f55dac1a398dff31ccb2c2ca5b68879a8))


### Bug Fixes

* **review:** suppress generated-path (dist/) findings at the output stage (Closes [#1597](https://github.com/s977043/river-review/issues/1597)) ([#1602](https://github.com/s977043/river-review/issues/1602)) ([c1dc2f6](https://github.com/s977043/river-review/commit/c1dc2f64d4bb49fd4d67ebfd25c0a4314617f36f))
* **skills:** knowledge-to-code 系 2 スキルを diff 中心に再設計し context ガードを追加する ([#1605](https://github.com/s977043/river-review/issues/1605)) ([1468991](https://github.com/s977043/river-review/commit/146899178955202f643d5d712d0049fdc9826820))

## [1.57.2](https://github.com/s977043/river-review/compare/v1.57.1...v1.57.2) (2026-07-19)


### Bug Fixes

* **scoring:** 不明 severity の fail-safe を info から major に修正し正典に委譲する ([#1595](https://github.com/s977043/river-review/issues/1595)) ([e8427e4](https://github.com/s977043/river-review/commit/e8427e4b047cd67dbc7754fd36a490229d972064)), closes [#1585](https://github.com/s977043/river-review/issues/1585)

## [1.57.1](https://github.com/s977043/river-review/compare/v1.57.0...v1.57.1) (2026-07-19)


### Bug Fixes

* **deps:** bump js-yaml to 4.2.0 in runners/node-api lockfile ([#1587](https://github.com/s977043/river-review/issues/1587)) ([840e44b](https://github.com/s977043/river-review/commit/840e44b0ef491094b26ef5b5a067c5410256c7b4))

## [1.57.0](https://github.com/s977043/river-review/compare/v1.56.2...v1.57.0) (2026-07-19)


### Features

* **skills:** 知識反映と振る舞い維持をレビューする2スキルを追加する ([#1579](https://github.com/s977043/river-review/issues/1579)) ([c55a357](https://github.com/s977043/river-review/commit/c55a35713a7572c150913b5acdce214a51c0e021)), closes [#1573](https://github.com/s977043/river-review/issues/1573)


### Bug Fixes

* **deps:** bump js-yaml to patched versions for DoS advisory ([#1578](https://github.com/s977043/river-review/issues/1578)) ([ab4a4ab](https://github.com/s977043/river-review/commit/ab4a4aba01ee471ff4e9e59d808516f0ea00fda5))
* **schema:** zod InputContextEnum を JSON Schema の inputContext enum と一致させる ([#1576](https://github.com/s977043/river-review/issues/1576)) ([1a1db19](https://github.com/s977043/river-review/commit/1a1db19278700c334c8693c9a160201b19aced11)), closes [#1564](https://github.com/s977043/river-review/issues/1564)

## [1.56.2](https://github.com/s977043/river-review/compare/v1.56.1...v1.56.2) (2026-07-19)


### Bug Fixes

* **diff:** dist バンドル生成物を LLM プロンプト向け diff から除外する ([#1570](https://github.com/s977043/river-review/issues/1570)) ([62b0cf3](https://github.com/s977043/river-review/commit/62b0cf3bfe1c093d6fb052d1ca8a6a7752c8820e))
* **review:** finding 検証を Severity/Confidence 必須に緩和しモデル実出力に合わせる ([#1571](https://github.com/s977043/river-review/issues/1571)) ([b15c950](https://github.com/s977043/river-review/commit/b15c950e6c220884e73a47a5af68b491a5107f1a))

## [1.56.1](https://github.com/s977043/river-review/compare/v1.56.0...v1.56.1) (2026-07-14)


### Bug Fixes

* **schema:** applyToExemptions 未定義と inputContext 値ズレによる strict loader 脱落を解消する ([#1559](https://github.com/s977043/river-review/issues/1559)) ([8c80372](https://github.com/s977043/river-review/commit/8c803726e5ae812d329ffd4dc19496ccf8c4aa76))
* **skills:** proto スキーマに一切マッチしない dead glob を修正する ([#1554](https://github.com/s977043/river-review/issues/1554)) ([58536ac](https://github.com/s977043/river-review/commit/58536ac471066ea2eba1e3130b35b8fd5ed0d413))
* **skills:** registry と SKILL.md の id ドリフトを解消し一致ガードを追加する ([#1558](https://github.com/s977043/river-review/issues/1558)) ([2be6165](https://github.com/s977043/river-review/commit/2be61653e4d3a87e38f79395cf08267324ec39ce))
* **skills:** registry の severity を SKILL.md（実行時 SSoT）に同期する（major 3 件） ([#1553](https://github.com/s977043/river-review/issues/1553)) ([9723759](https://github.com/s977043/river-review/commit/9723759b0806dd396b5e94bbc62ef4dd8300fc54))
* **skills:** プロセス補助スキル 2 件の severity を info に再分類する ([#1552](https://github.com/s977043/river-review/issues/1552)) ([bada65c](https://github.com/s977043/river-review/commit/bada65cf3cdec041f158790416bfc19d23286c55))
* **skills:** 実装成果物を対象とするスキルの phase を複数指定に修正する ([#1556](https://github.com/s977043/river-review/issues/1556)) ([3a84021](https://github.com/s977043/river-review/commit/3a840212d68202892071c82e18d98ef3abc714b4))
* **verifier:** 配列 phase スキルで finding が Phase mismatch 破棄されるのを修正する ([#1566](https://github.com/s977043/river-review/issues/1566)) ([2713519](https://github.com/s977043/river-review/commit/2713519d6f8727c7b667ed52d7379860dd683d51))

## [1.56.0](https://github.com/s977043/river-review/compare/v1.55.0...v1.56.0) (2026-07-13)


### Features

* **review:** selectRolesAuto に stage/risk/artifact signal を形式化する ([#1545](https://github.com/s977043/river-review/issues/1545)) ([#1547](https://github.com/s977043/river-review/issues/1547)) ([0f3e1a3](https://github.com/s977043/river-review/commit/0f3e1a33eb723874f014afc871c6ce8ecdf4eef1))


### Bug Fixes

* **ci:** lychee 0.24 の include_fragments 型変更に .lychee.toml を追随させる ([#1550](https://github.com/s977043/river-review/issues/1550)) ([eba9c3f](https://github.com/s977043/river-review/commit/eba9c3f5c566aaffe65f9f6c93e1a5ea742e43f8))

## [1.55.0](https://github.com/s977043/river-review/compare/v1.54.1...v1.55.0) (2026-07-12)


### Features

* **skills:** logging-observability に debug 出力の redaction 迂回観点を追加する ([#1536](https://github.com/s977043/river-review/issues/1536)) ([ea448bc](https://github.com/s977043/river-review/commit/ea448bc286be4babc1802f0d3d58a5669dbcca4b))

## [1.54.1](https://github.com/s977043/river-review/compare/v1.54.0...v1.54.1) (2026-07-12)


### Bug Fixes

* **review:** maxTokens引き上げと不正findingの部分許容でCI LLMレビューのfallbackを局所化する ([#1533](https://github.com/s977043/river-review/issues/1533)) ([fba8205](https://github.com/s977043/river-review/commit/fba820598b96ed7365007ac9720e2243652a4170))

## [1.54.0](https://github.com/s977043/river-review/compare/v1.53.0...v1.54.0) (2026-07-12)


### Features

* **ci:** river-review LLM レビューを GitHub Models（GITHUB_TOKEN）へ切替える ([#1526](https://github.com/s977043/river-review/issues/1526)) ([febb88f](https://github.com/s977043/river-review/commit/febb88f2febfff72eaf9dd0f9f1eebe0feca51dd))
* **skills:** scripts/ JSDoc unknown-&gt;any 緩和提案のFPをguard+canary化する ([#1528](https://github.com/s977043/river-review/issues/1528)) ([dc1dd0e](https://github.com/s977043/river-review/commit/dc1dd0ea1a24ec0dd96f19136411f18095c43c15))


### Bug Fixes

* **agent-skills:** river-review-code の applyTo を app/lib/packages/scripts/runners へ拡張する ([#1530](https://github.com/s977043/river-review/issues/1530)) ([c1dd4e1](https://github.com/s977043/river-review/commit/c1dd4e18b0f8704289fe7434d3cf7410d0579db1))
* **agent-skills:** river-review-frontend の applyTo を pages/lib/packages へ拡張する ([#1531](https://github.com/s977043/river-review/issues/1531)) ([3faf12b](https://github.com/s977043/river-review/commit/3faf12b03cbbaa8549c2849b377d723ed08b7da1))
* **agent-skills:** river-review-performance の applyTo 拡張と operability-slo exemption を追加する ([#1532](https://github.com/s977043/river-review/issues/1532)) ([168712a](https://github.com/s977043/river-review/commit/168712a1ede8490dd62d1611b9ad4054bcec05bb))
* **review:** レビュー結果のパース失敗を切り分け可能にし追加指示との競合を解消する (T64) ([#1529](https://github.com/s977043/river-review/issues/1529)) ([e212cf2](https://github.com/s977043/river-review/commit/e212cf2b1fa31be14fa80ccb86675dfa6da81fee))

## [1.53.0](https://github.com/s977043/river-review/compare/v1.52.0...v1.53.0) (2026-07-12)


### Features

* **skills:** 配布文脈リンクとseverity二重語彙のFP2種をguard+canary化する ([#1523](https://github.com/s977043/river-review/issues/1523)) ([9a7a5aa](https://github.com/s977043/river-review/commit/9a7a5aaddb6752e69d5a3b4fb9e664d63277d487))


### Bug Fixes

* **agent-skills:** cache-strategy-consistency を performance から exemption 化する ([#1522](https://github.com/s977043/river-review/issues/1522)) ([25ce531](https://github.com/s977043/river-review/commit/25ce531287f4c46c8fe02f95ed47563ff7c27bd6))

## [1.52.0](https://github.com/s977043/river-review/compare/v1.51.0...v1.52.0) (2026-07-12)


### Features

* **ci:** zenn 記事の週次ウォッチ workflow を追加する ([#1513](https://github.com/s977043/river-review/issues/1513)) ([a81906c](https://github.com/s977043/river-review/commit/a81906ccabc32152d4bebd7ae05c9076f9bc8003))
* **skills:** fix-scope-integrity 観点で指摘対応ループのスコープ逸脱・前提破壊を検出する ([#1516](https://github.com/s977043/river-review/issues/1516)) ([#1520](https://github.com/s977043/river-review/issues/1520)) ([3610cf8](https://github.com/s977043/river-review/commit/3610cf8eb55ed27e162fb55477b9473ebc705962))

## [1.51.0](https://github.com/s977043/river-review/compare/v1.50.0...v1.51.0) (2026-07-12)


### Features

* **validator:** agent-skills エントリの applyTo 包含検査を追加する ([#1508](https://github.com/s977043/river-review/issues/1508)) ([#1509](https://github.com/s977043/river-review/issues/1509)) ([48e75cf](https://github.com/s977043/river-review/commit/48e75cf1ce757dd8cc348e53b5e163e38b7990c5))

## [1.50.0](https://github.com/s977043/river-review/compare/v1.49.0...v1.50.0) (2026-07-11)


### Features

* **skills:** assumption-resolution-trace registry skill を追加する ([#1470](https://github.com/s977043/river-review/issues/1470) P2 G3) ([#1503](https://github.com/s977043/river-review/issues/1503)) ([1ecd666](https://github.com/s977043/river-review/commit/1ecd66624220131745601348a2321b517c8d6155))
* **skills:** impact-evidence-coverage registry skill を追加する ([#1470](https://github.com/s977043/river-review/issues/1470) P2 G1/G2) ([#1502](https://github.com/s977043/river-review/issues/1502)) ([fad8f74](https://github.com/s977043/river-review/commit/fad8f747daec8d2c5d0d4b2c1e6cef33477c7ec7))
* **skills:** unknown-coverage-review の Output・観点6・委譲を精緻化する ([#1470](https://github.com/s977043/river-review/issues/1470) P2) ([#1504](https://github.com/s977043/river-review/issues/1504)) ([5de796e](https://github.com/s977043/river-review/commit/5de796e4ff47c2830d23effa697bdcf27e3030e8))

## [1.49.0](https://github.com/s977043/river-review/compare/v1.48.0...v1.49.0) (2026-07-11)


### Features

* **review-team:** bug-hunter focusInstructions に並行アクセス競合を明示する ([#1455](https://github.com/s977043/river-review/issues/1455) C1) ([#1498](https://github.com/s977043/river-review/issues/1498)) ([d0f39b5](https://github.com/s977043/river-review/commit/d0f39b51f031a615aaba0bf9d9e8b1f561ba7395))
* **skills:** river-review-frontend エントリスキルを新設する ([#1462](https://github.com/s977043/river-review/issues/1462) 案B) ([#1500](https://github.com/s977043/river-review/issues/1500)) ([8f38551](https://github.com/s977043/river-review/commit/8f38551f6d845837cd58cb8de6561bd6c0e127a9))

## [1.48.0](https://github.com/s977043/river-review/compare/v1.47.0...v1.48.0) (2026-07-11)


### Features

* **feedback:** feedback:rules に --out artifact 出力を追加する ([#1471](https://github.com/s977043/river-review/issues/1471) 増分B) ([#1492](https://github.com/s977043/river-review/issues/1492)) ([5fdcc36](https://github.com/s977043/river-review/commit/5fdcc368a2a8e61c73f8bbca949fa836a783bd67))
* **skills:** Unknown Coverage Review のメタ観点 agent-skill を追加する ([#1470](https://github.com/s977043/river-review/issues/1470) P1) ([#1494](https://github.com/s977043/river-review/issues/1494)) ([6cd218c](https://github.com/s977043/river-review/commit/6cd218c233418bda2bde57c0921ecc89fb0e4651))

## [1.47.0](https://github.com/s977043/river-review/compare/v1.46.1...v1.47.0) (2026-07-11)


### Features

* **feedback:** reviewer/model/reversedBy と out_of_scope を後方互換で追加する ([#1471](https://github.com/s977043/river-review/issues/1471) 増分A) ([#1488](https://github.com/s977043/river-review/issues/1488)) ([9d477d4](https://github.com/s977043/river-review/commit/9d477d47b40ad2bd2e34b424746753aedc419132))
* **skill:** refactor-claim-audit に抽出・集約リファクタの退行観点を追加する ([#1487](https://github.com/s977043/river-review/issues/1487)) ([5d5423f](https://github.com/s977043/river-review/commit/5d5423fb362704110510dcdc2b0ea64f22c4c017))
* **skills:** bot FP パターン3種を guard と canary で機械担保する ([#1489](https://github.com/s977043/river-review/issues/1489)) ([ebf9f33](https://github.com/s977043/river-review/commit/ebf9f33e6119bce2542b625951656cb73d6b9cdf))

## [1.46.1](https://github.com/s977043/river-review/compare/v1.46.0...v1.46.1) (2026-07-11)


### Bug Fixes

* isDirectRun 判定を単一ヘルパーに集約し ENOENT クラッシュを解消する ([#1483](https://github.com/s977043/river-review/issues/1483)) ([832e0ab](https://github.com/s977043/river-review/commit/832e0ab239548e09d347d41d53bac5661a345f8a))
* Step 6 集約後の防波堤強化（F-2 symlink 追跡復元 / F-3 テスト / F-4 export 除去） ([#1482](https://github.com/s977043/river-review/issues/1482)) ([8701b28](https://github.com/s977043/river-review/commit/8701b28c6d9a119c1efe31efb40b43ba6d1db07b))

## [1.46.0](https://github.com/s977043/river-review/compare/v1.45.0...v1.46.0) (2026-07-10)


### Features

* **scripts:** skill 命名規則の validator と canary を追加する ([#1468](https://github.com/s977043/river-review/issues/1468)) ([00206ea](https://github.com/s977043/river-review/commit/00206ea09fcdf7274294b1ad5bf626e14fce29fe))

## [1.45.0](https://github.com/s977043/river-review/compare/v1.44.0...v1.45.0) (2026-07-10)


### Features

* **skills:** river-review-code に UX-SAFEGUARD 操作安全装置観点を追加する ([#1460](https://github.com/s977043/river-review/issues/1460)) ([4324ea3](https://github.com/s977043/river-review/commit/4324ea3245ca72a60f06abeff889f5792ee6cd6b))
* **skills:** SIMPLIFY 観点の真ギャップ2観点（altitude / closure）を registry skill 化する ([#1465](https://github.com/s977043/river-review/issues/1465)) ([7c1150f](https://github.com/s977043/river-review/commit/7c1150f970a0aa9f38d419db91e002b80f640765))
* **skills:** 幻覚的参照の実在確認スキル hallucinated-reference を追加する ([#1457](https://github.com/s977043/river-review/issues/1457)) ([d4068f8](https://github.com/s977043/river-review/commit/d4068f837bdc278d6d2b80c83b69f2ebee0c4eec))
* **skills:** 非同期処理の正しさ検証スキル async-correctness を追加する ([#1458](https://github.com/s977043/river-review/issues/1458)) ([ba5b9db](https://github.com/s977043/river-review/commit/ba5b9db7d68960fd5ec6cfaa08a4656f46014df1))

## [1.44.0](https://github.com/s977043/river-review/compare/v1.43.1...v1.44.0) (2026-07-10)


### Features

* **skills:** river-review-code に simplify 品質クリーンアップ観点を追加する ([#1453](https://github.com/s977043/river-review/issues/1453)) ([c5bb2d8](https://github.com/s977043/river-review/commit/c5bb2d8a331ced5562b61eb1f7e0c956b1a4d7cb))

## [1.43.1](https://github.com/s977043/river-review/compare/v1.43.0...v1.43.1) (2026-07-09)


### Bug Fixes

* **ci:** scan の HARDCODED_SECRET 誤検出を ignore_paths に追加する ([#1448](https://github.com/s977043/river-review/issues/1448)) ([7481b00](https://github.com/s977043/river-review/commit/7481b00dd319a25c328f2c2805c816946a462cc0))

## [1.43.0](https://github.com/s977043/river-review/compare/v1.42.0...v1.43.0) (2026-07-08)


### Features

* **plugin:** plugin:validate に command/agent の逆ドリフト検査を追加する ([#1443](https://github.com/s977043/river-review/issues/1443)) ([4d479e2](https://github.com/s977043/river-review/commit/4d479e21fa3aefdff9464c984bca13cf0918d4e4))

## [1.42.0](https://github.com/s977043/river-review/compare/v1.41.0...v1.42.0) (2026-07-07)


### Features

* **action:** deterministic 実行の opt-in を CI に dark-launch 配線する ([#1401](https://github.com/s977043/river-review/issues/1401)) ([#1435](https://github.com/s977043/river-review/issues/1435)) ([1668dab](https://github.com/s977043/river-review/commit/1668dab030a90c2e6538ee3d5d839282cc556219))
* **gate:** deterministic gate orchestrator を追加する ([#1401](https://github.com/s977043/river-review/issues/1401)) ([#1433](https://github.com/s977043/river-review/issues/1433)) ([b765958](https://github.com/s977043/river-review/commit/b7659589f46a0a12250640324d930e5c058378bb))
* **gate:** deterministicGate command allowlist の検証層を追加する ([#1401](https://github.com/s977043/river-review/issues/1401)) ([#1427](https://github.com/s977043/river-review/issues/1427)) ([ff7733a](https://github.com/s977043/river-review/commit/ff7733ac478fc02d636df495bcb892188091e9ca))
* **gate:** deterministicUnrunnable → ESCALATE の gate 契約(rule 5c)を追加する ([#1401](https://github.com/s977043/river-review/issues/1401)) ([#1432](https://github.com/s977043/river-review/issues/1432)) ([ce29cd1](https://github.com/s977043/river-review/commit/ce29cd128e4f0461253b5793071d156542ac17ee))
* **gate:** executor の clean cwd + env builder を追加する ([#1401](https://github.com/s977043/river-review/issues/1401)) ([#1430](https://github.com/s977043/river-review/issues/1430)) ([392fd69](https://github.com/s977043/river-review/commit/392fd69b32ea1f41d1314b2711bd906647efee56))
* **gate:** executor の execFile 起動 + exit code 分類を追加する ([#1401](https://github.com/s977043/river-review/issues/1401)) ([#1431](https://github.com/s977043/river-review/issues/1431)) ([7063b0f](https://github.com/s977043/river-review/commit/7063b0f4707c2d795d7574dec8aab2dd251bf48a))
* **gate:** review pipeline が deterministic 実行を二重ゲート越しに消費する ([#1401](https://github.com/s977043/river-review/issues/1401)) ([#1434](https://github.com/s977043/river-review/issues/1434)) ([04b9f17](https://github.com/s977043/river-review/commit/04b9f17ee5c057f6de1d9f4881583afa762114ed))
* RiverReview Discipline レビュー規律 skill を追加する ([#1424](https://github.com/s977043/river-review/issues/1424)) ([9c35a5d](https://github.com/s977043/river-review/commit/9c35a5d2bb51bae0c8cb63b62052799daee2d6d0))

## [1.41.0](https://github.com/s977043/river-review/compare/v1.40.0...v1.41.0) (2026-07-06)


### Features

* **cli:** --gate で gate 判定を exit code に写像する ([#1351](https://github.com/s977043/river-review/issues/1351)) ([#1404](https://github.com/s977043/river-review/issues/1404)) ([c97f955](https://github.com/s977043/river-review/commit/c97f955723d81b4b954c2d6d7cf0ab33fccc2bbf))
* **gate:** deterministic strict_block を gate が消費する ([#1351](https://github.com/s977043/river-review/issues/1351)) ([#1403](https://github.com/s977043/river-review/issues/1403)) ([1f6a47f](https://github.com/s977043/river-review/commit/1f6a47fd6ac48cc2a6de9426d8f9afa79d5a9280))
* **loop:** reference loop に gate 消費を実装する ([#1400](https://github.com/s977043/river-review/issues/1400)) ([bf7e281](https://github.com/s977043/river-review/commit/bf7e2811c4916f741e99448af2f87f54a3b6d79c))

## [1.40.0](https://github.com/s977043/river-review/compare/v1.39.0...v1.40.0) (2026-07-05)


### Features

* **ci:** auto-rebuild github-action dist on stale PRs ([#1380](https://github.com/s977043/river-review/issues/1380)) ([e964db2](https://github.com/s977043/river-review/commit/e964db24f100856a66e19eafa559105f191132ef))
* **commands:** add /merge-check repo-dev command for pre-merge checklist ([#1383](https://github.com/s977043/river-review/issues/1383)) ([a3ea08b](https://github.com/s977043/river-review/commit/a3ea08b92a166666745e507f25a615b795a77c48))
* **commands:** add /verify-agent-report repo-dev command ([#1377](https://github.com/s977043/river-review/issues/1377)) ([99e274f](https://github.com/s977043/river-review/commit/99e274fd988e2142cff8b4be1aac96a04dbc18bc))
* **hooks:** add gh account guard as a PreToolUse hook ([#1375](https://github.com/s977043/river-review/issues/1375)) ([5ad09e6](https://github.com/s977043/river-review/commit/5ad09e6a38cac63c056c81c8d9daa82765adaf04))
* **lint:** bot 頻出指摘を機械化する code hygiene checker を追加 ([#1382](https://github.com/s977043/river-review/issues/1382)) ([4643677](https://github.com/s977043/river-review/commit/4643677b96b8a58e23e6a80e3e904fcda504482d))
* **metrics:** context lift + schema parity canary + SKIPPED_BY_POLICY ([#1398](https://github.com/s977043/river-review/issues/1398)) ([815e1c6](https://github.com/s977043/river-review/commit/815e1c6ce89fa7c1fc931d09ce1bae70231fef1b))
* **plan-review:** adjudicator 堅牢化 + regex recall の ratchet 実測 ([#1370](https://github.com/s977043/river-review/issues/1370)) ([f2f7f40](https://github.com/s977043/river-review/commit/f2f7f40b964d04e42f3a79d0ab3be505741d9511))
* **plugin:** add bundle field allowlist and cross-manifest parity checks ([#1378](https://github.com/s977043/river-review/issues/1378)) ([f74e40f](https://github.com/s977043/river-review/commit/f74e40f20b84ebda22c0d25772240fff160b2f69))
* **pr:** add description-vs-actual consistency checks to /pr and pr-description skill ([#1379](https://github.com/s977043/river-review/issues/1379)) ([c0ae895](https://github.com/s977043/river-review/commit/c0ae895ed21281a4b4c1bbb747ac1b564bb12c5f))
* **supervision:** 監査証跡の蓄積 + runs digest + Action 強制表示点 ([#1372](https://github.com/s977043/river-review/issues/1372)) ([8a1c864](https://github.com/s977043/river-review/commit/8a1c8642c40af17dd9a637530aa13429a2d56b89))
* **validate:** mechanize skill fixture/description drift guard ([#1381](https://github.com/s977043/river-review/issues/1381)) ([3173200](https://github.com/s977043/river-review/commit/3173200f181d75b776c6f336c956afeb97c37b2e))


### Bug Fixes

* **dashboard:** replace fabricated stats with real, offline-verifiable data ([#1389](https://github.com/s977043/river-review/issues/1389)) ([509d63f](https://github.com/s977043/river-review/commit/509d63fa41df659949cde4155c47052dec1c1820))
* **scripts:** segment-match agent-skills skip and trim resolved flat-path allowlist ([#1384](https://github.com/s977043/river-review/issues/1384)) ([91d1ccd](https://github.com/s977043/river-review/commit/91d1ccdfbe023e54fff0160ad96f76669a0ee081))
* **skills:** repair registry path drift and add registry path validation ([#1376](https://github.com/s977043/river-review/issues/1376)) ([3c87caa](https://github.com/s977043/river-review/commit/3c87caabaa5eecbb2c177ad4c493894bcf914226))

## [1.39.0](https://github.com/s977043/river-review/compare/v1.38.1...v1.39.0) (2026-07-02)


### Features

* **gate:** evaluationType スキーマ + executionOrder/estimatedCost + river run 配線 ([#1349](https://github.com/s977043/river-review/issues/1349)) ([#1366](https://github.com/s977043/river-review/issues/1366)) ([32f1633](https://github.com/s977043/river-review/commit/32f1633592ec84063fe32c244ac688a6c050fac9))
* **gate:** gateDecision 契約 — 決定論純関数 + fail-safe + 監査ブロック ([#1364](https://github.com/s977043/river-review/issues/1364)) ([4ec8690](https://github.com/s977043/river-review/commit/4ec8690ddc644f03beba0f398a8b96d4389eec27))
* **gate:** 契約 doc の gate 節 + conformance fixture + approval-scan 抽出 ([#1367](https://github.com/s977043/river-review/issues/1367)) ([9a43ed5](https://github.com/s977043/river-review/commit/9a43ed5d7489332d2014e39dcc9c4fce9b9d701b))

## [1.38.1](https://github.com/s977043/river-review/compare/v1.38.0...v1.38.1) (2026-07-02)


### Bug Fixes

* **plan-review:** adjudicator の呼び出しガード・injection 防御・pipeline 統合・観測性を修繕する ([#1360](https://github.com/s977043/river-review/issues/1360)) ([8e2196d](https://github.com/s977043/river-review/commit/8e2196dc8c991543e5d58ee071a91c21fbcfd2c0))
* **plan-review:** 検出器のゼロ幅・改行バイパスと形容詞用法の誤爆を修正する ([#1358](https://github.com/s977043/river-review/issues/1358)) ([c8037f1](https://github.com/s977043/river-review/commit/c8037f16d3972bc172c683ddbe72688d11d163b2))

## [1.38.0](https://github.com/s977043/river-review/compare/v1.37.0...v1.38.0) (2026-07-02)


### Features

* **plan-review:** S1 検出器強化 — LLM adjudicator 配線 + recall 改善 + 敵対的 canary ([#1354](https://github.com/s977043/river-review/issues/1354)) ([bcb9733](https://github.com/s977043/river-review/commit/bcb973398473ec92902910001cc0875124ed5018))

## [1.37.0](https://github.com/s977043/river-review/compare/v1.36.0...v1.37.0) (2026-07-01)


### Features

* **skill:** add ai-agent-review-readiness upstream skill ([#1325](https://github.com/s977043/river-review/issues/1325) S1) ([#1328](https://github.com/s977043/river-review/issues/1328)) ([9a8265b](https://github.com/s977043/river-review/commit/9a8265bf1b63b01dc33b1b55d691d6a5db6ff040))
* **skill:** add Check 5 feedback capture + promptfoo eval for ai-agent-review-readiness ([#1325](https://github.com/s977043/river-review/issues/1325) S4) ([#1331](https://github.com/s977043/river-review/issues/1331)) ([cfe1b77](https://github.com/s977043/river-review/commit/cfe1b77239693ef514dbdf9424c1ca5c1e06f194))


### Bug Fixes

* **ci:** extend skill-id checker to README.md path errors and fix dangling refs ([#1332](https://github.com/s977043/river-review/issues/1332)) ([#1334](https://github.com/s977043/river-review/issues/1334)) ([313d7ad](https://github.com/s977043/river-review/commit/313d7adb72983eb3294c9bcb1123cc8963224bed))
* **skills:** [#1329](https://github.com/s977043/river-review/issues/1329) レビュー指摘の follow-up — allowlist 誤登録の修正 + ガード拡張 + test ([#1335](https://github.com/s977043/river-review/issues/1335)) ([3abfc34](https://github.com/s977043/river-review/commit/3abfc34e85c4884fc78d6f57e064e06786e61e04))
* **skills:** 旧 skill ID 参照(rr-*-001)の dangling 修正 + 再発防止ガード ([#1329](https://github.com/s977043/river-review/issues/1329)) ([3696771](https://github.com/s977043/river-review/commit/3696771306e5fb3f425c23718d357d9037846578))
* stale module refs, duplicate import, missing tests after refactor merges ([#1346](https://github.com/s977043/river-review/issues/1346)) ([bd92e4c](https://github.com/s977043/river-review/commit/bd92e4cdff2daa22638c4ddbd00c0db6878c73f5))

## [1.36.0](https://github.com/s977043/river-review/compare/v1.35.1...v1.36.0) (2026-06-30)


### Features

* add Review Mode Router for risk-based review depth selection ([#1324](https://github.com/s977043/river-review/issues/1324)) ([be76ade](https://github.com/s977043/river-review/commit/be76ade1cdde8dc9d3f8daae4c4ab66f96627cd3))

## [1.35.1](https://github.com/s977043/river-review/compare/v1.35.0...v1.35.1) (2026-06-29)


### Bug Fixes

* update NO_REVIEW output strings from rr-*-001 to simplified skill IDs ([#1321](https://github.com/s977043/river-review/issues/1321)) ([45e66bc](https://github.com/s977043/river-review/commit/45e66bc94451b6c0fad6e7e5382dd20e93c5aa7f))

## [1.35.0](https://github.com/s977043/river-review/compare/v1.34.0...v1.35.0) (2026-06-29)


### Features

* **review-team:** add review-team skill and /review-team command ([#1309](https://github.com/s977043/river-review/issues/1309)) ([b817f32](https://github.com/s977043/river-review/commit/b817f327c3417e249c9c5e67d583167618519e1a))


### Bug Fixes

* **plugin:** add review-team command to Claude Code plugin manifest ([#1311](https://github.com/s977043/river-review/issues/1311)) ([f92428c](https://github.com/s977043/river-review/commit/f92428c92ce36adc10a278c0c58d329e2f4df044))

## [1.34.0](https://github.com/s977043/river-review/compare/v1.33.0...v1.34.0) (2026-06-25)


### Features

* **review-team:** add consensusLevel badge and teamLeadReport to PR comments ([#1308](https://github.com/s977043/river-review/issues/1308)) ([2eba500](https://github.com/s977043/river-review/commit/2eba50035a99fa07a7ce9e9df602e9db28154f64))
* **review-team:** add consensusLevel metadata field to findings ([#1305](https://github.com/s977043/river-review/issues/1305)) ([e718dfe](https://github.com/s977043/river-review/commit/e718dfeb2398b9de5c3a9193821ece64a85f1b08))
* **review-team:** add Tech Lead deterministic synthesis report ([#1306](https://github.com/s977043/river-review/issues/1306)) ([b8953d1](https://github.com/s977043/river-review/commit/b8953d1c5395527f06bb7aaaf20aa0f3726ab5b9))

## [1.33.0](https://github.com/s977043/river-review/compare/v1.32.0...v1.33.0) (2026-06-24)


### Features

* add reproducible social asset PNG export ([#1299](https://github.com/s977043/river-review/issues/1299)) ([5b0506d](https://github.com/s977043/river-review/commit/5b0506de107fae27cd0c20ed1a71bd7abd4a2636))

## [1.32.0](https://github.com/s977043/river-review/compare/v1.31.0...v1.32.0) (2026-06-24)


### Features

* **planner:** expose analyzeTestImpact() signal on the execution plan ([#1292](https://github.com/s977043/river-review/issues/1292)) ([a99ea36](https://github.com/s977043/river-review/commit/a99ea36b96af4252e7e4ba0da7087cb8ae634e21))
* **planner:** opt-in escalation of test skills for high-risk diffs ([#1255](https://github.com/s977043/river-review/issues/1255) follow-up) ([#1295](https://github.com/s977043/river-review/issues/1295)) ([90a89c0](https://github.com/s977043/river-review/commit/90a89c0e51a374cbdffd5380103436fbdc0cd738))

## [1.31.0](https://github.com/s977043/river-review/compare/v1.30.1...v1.31.0) (2026-06-23)


### Features

* **cli:** add runtime Ajv validation for output.schema.json in formatJsonOutput ([#1271](https://github.com/s977043/river-review/issues/1271)) ([e43dfc1](https://github.com/s977043/river-review/commit/e43dfc1e3b7a1c7e3fde93dd27197cd1ece6e553))
* **skills:** add ask-codex skill to delegate reviews to Codex CLI ([#1274](https://github.com/s977043/river-review/issues/1274)) ([ec8f6a8](https://github.com/s977043/river-review/commit/ec8f6a87b5ec7060cdcd7367a542c1616cbd01e5))


### Bug Fixes

* **ci:** update scorecard-action and codeql-action to valid SHAs ([#1264](https://github.com/s977043/river-review/issues/1264)) ([d005cb7](https://github.com/s977043/river-review/commit/d005cb7f73021c058907500f12efeb18a5ee4c28))
* **deps:** add npm overrides for http-proxy-middleware and @babel/core ([#1267](https://github.com/s977043/river-review/issues/1267)) ([5e850b9](https://github.com/s977043/river-review/commit/5e850b96d9e0f0aeddbed7391d099d0d2c8b6a69))

## [1.30.1](https://github.com/s977043/river-review/compare/v1.30.0...v1.30.1) (2026-06-22)


### Bug Fixes

* **deps:** add npm overrides for serialize-javascript, qs, uuid ([#1257](https://github.com/s977043/river-review/issues/1257)) ([40fb0ee](https://github.com/s977043/river-review/commit/40fb0eef2ab80aca604678308fafad63d126367f))

## [1.30.0](https://github.com/s977043/river-review/compare/v1.29.0...v1.30.0) (2026-06-22)


### Features

* **plugin:** add setup-team command, composerIcon, and plugin field sync ([#1251](https://github.com/s977043/river-review/issues/1251)) ([b78769e](https://github.com/s977043/river-review/commit/b78769e60923495b20f8807d2c65c3e14c93e915))

## [1.29.0](https://github.com/s977043/river-review/compare/v1.28.1...v1.29.0) (2026-06-22)


### Features

* **ci:** add HOL Plugin Scanner + pin GitHub Actions for awesome-codex-plugins ([#1248](https://github.com/s977043/river-review/issues/1248)) ([16be8ef](https://github.com/s977043/river-review/commit/16be8ef5eb91becf0e746ccdea2f9a9f7561e9cd))


### Bug Fixes

* **plugin:** add composerIcon and assets to .codex-plugin ([#1250](https://github.com/s977043/river-review/issues/1250)) ([469ea7a](https://github.com/s977043/river-review/commit/469ea7a2dd5cca82c035534cb75c2f575e03e737))

## [1.28.1](https://github.com/s977043/river-review/compare/v1.28.0...v1.28.1) (2026-06-21)


### Bug Fixes

* **skills:** harden security-privacy-design eval assertions for JA output ([#1238](https://github.com/s977043/river-review/issues/1238)) ([#1239](https://github.com/s977043/river-review/issues/1239)) ([91eb767](https://github.com/s977043/river-review/commit/91eb76703e7977ba0c097ed0705763a06b39afbc))

## [1.28.0](https://github.com/s977043/river-review/compare/v1.27.0...v1.28.0) (2026-06-21)


### Features

* **skills:** secret-scan exclude globs + promptfoo eval seed ([#1231](https://github.com/s977043/river-review/issues/1231)/[#1232](https://github.com/s977043/river-review/issues/1232)) ([#1236](https://github.com/s977043/river-review/issues/1236)) ([7285a8d](https://github.com/s977043/river-review/commit/7285a8dc95fd738967f848cf0c79d5c442a44cd3))
* **tooling:** document skill exec paths + forward-gate recommended-skill eval coverage ([#1231](https://github.com/s977043/river-review/issues/1231)/[#1232](https://github.com/s977043/river-review/issues/1232)) ([#1235](https://github.com/s977043/river-review/issues/1235)) ([3247eef](https://github.com/s977043/river-review/commit/3247eef549ffa4b5770b4ff7070a4c611d24697f))

## [1.27.0](https://github.com/s977043/river-review/compare/v1.26.0...v1.27.0) (2026-06-21)


### Features

* **skills:** explicit Plan Alignment finding taxonomy in exec-conformance ([#1223](https://github.com/s977043/river-review/issues/1223)) ([#1227](https://github.com/s977043/river-review/issues/1227)) ([4c28e95](https://github.com/s977043/river-review/commit/4c28e954980a92ccf7115fd74e89303b114c72ed))
* **skills:** TDD Evidence Review skill + tdd-ledger artifact ([#1223](https://github.com/s977043/river-review/issues/1223)) ([#1229](https://github.com/s977043/river-review/issues/1229)) ([d2adf4b](https://github.com/s977043/river-review/commit/d2adf4be9f8a2c0e38ec37231e53e382ce1ab118))

## [1.26.0](https://github.com/s977043/river-review/compare/v1.25.2...v1.26.0) (2026-06-21)


### Features

* **skills:** design-source-conformance & component-variants-states perspectives ([#1217](https://github.com/s977043/river-review/issues/1217)) ([#1226](https://github.com/s977043/river-review/issues/1226)) ([5efc37d](https://github.com/s977043/river-review/commit/5efc37dd4a9d4c81efd1491d6451d2b3954a33ae))
* **skills:** secret-credential-scan & doc-hygiene perspectives ([#1216](https://github.com/s977043/river-review/issues/1216)) ([#1222](https://github.com/s977043/river-review/issues/1222)) ([47e6dd7](https://github.com/s977043/river-review/commit/47e6dd7404daf0674f40baaddc08feb14c5667a0))

## [1.25.2](https://github.com/s977043/river-review/compare/v1.25.1...v1.25.2) (2026-06-21)


### Bug Fixes

* **skills:** harden Gate + FP guards for the two LLM-only [#169](https://github.com/s977043/river-review/issues/169) skills ([#1214](https://github.com/s977043/river-review/issues/1214) P0/P1/P2) ([#1218](https://github.com/s977043/river-review/issues/1218)) ([8622d06](https://github.com/s977043/river-review/commit/8622d0693dd92c2a2e7c526208f66fc49ec507c6))

## [1.25.1](https://github.com/s977043/river-review/compare/v1.25.0...v1.25.1) (2026-06-19)


### Bug Fixes

* **skills:** align conformance registry description with SKILL.md frontmatter ([#1212](https://github.com/s977043/river-review/issues/1212)) ([75a046d](https://github.com/s977043/river-review/commit/75a046d76065d953f3be094fd113aa2bf397f56f))

## [1.25.0](https://github.com/s977043/river-review/compare/v1.24.0...v1.25.0) (2026-06-19)


### Features

* **skills:** end-to-end-wiring & existing-pattern-conformance review perspectives ([#169](https://github.com/s977043/river-review/issues/169) adoption) ([#1209](https://github.com/s977043/river-review/issues/1209)) ([dda2ed0](https://github.com/s977043/river-review/commit/dda2ed0e3e390dcc01ee71056979030e7b409ca1))

## [1.24.0](https://github.com/s977043/river-review/compare/v1.23.0...v1.24.0) (2026-06-18)


### Features

* **review-engine:** retry transient LLM failures with backoff ([#1203](https://github.com/s977043/river-review/issues/1203)) ([2a5275a](https://github.com/s977043/river-review/commit/2a5275a5dceb341428220fcbf3c7999fb9f812b8))

## [1.23.0](https://github.com/s977043/river-review/compare/v1.22.0...v1.23.0) (2026-06-17)


### Features

* **orchestrator:** risk-router granularity — dependency/frontend/ci-cd roles ([#1196](https://github.com/s977043/river-review/issues/1196) S3) ([#1198](https://github.com/s977043/river-review/issues/1198)) ([8a8ccff](https://github.com/s977043/river-review/commit/8a8ccfff05ccdbeeb76be2c3095ee49747269d66))
* **skills:** framework-agnostic migration safety review ([#1196](https://github.com/s977043/river-review/issues/1196) S4) ([#1200](https://github.com/s977043/river-review/issues/1200)) ([dc77650](https://github.com/s977043/river-review/commit/dc776507565acad34d947ed23fc8d10544357da8))

## [1.22.0](https://github.com/s977043/river-review/compare/v1.21.0...v1.22.0) (2026-06-17)


### Features

* **html:** loop dashboard for runs diff --output html ([#1191](https://github.com/s977043/river-review/issues/1191)) ([#1192](https://github.com/s977043/river-review/issues/1192)) ([cbcca8f](https://github.com/s977043/river-review/commit/cbcca8f40900e9fc517f9db36cb1167d8916a8b1))

## [1.21.0](https://github.com/s977043/river-review/compare/v1.20.0...v1.21.0) (2026-06-17)


### Features

* **eval:** convergence efficiency evaluator ([#1171](https://github.com/s977043/river-review/issues/1171) item4) ([#1188](https://github.com/s977043/river-review/issues/1188)) ([3552a87](https://github.com/s977043/river-review/commit/3552a876725a2ac43fe60439a4ff65ed71964ae1))

## [1.20.0](https://github.com/s977043/river-review/compare/v1.19.0...v1.20.0) (2026-06-17)


### Features

* **examples:** loop reference agent + contract test ([#1171](https://github.com/s977043/river-review/issues/1171) item2) ([#1186](https://github.com/s977043/river-review/issues/1186)) ([be6d625](https://github.com/s977043/river-review/commit/be6d6254a5df1ff207d83fdf627b00f68c97fb41))

## [1.19.0](https://github.com/s977043/river-review/compare/v1.18.1...v1.19.0) (2026-06-17)


### Features

* **adversarial-review:** add 3 claim-vs-actual detection skills ([#1177](https://github.com/s977043/river-review/issues/1177)) ([#1184](https://github.com/s977043/river-review/issues/1184)) ([b4139f2](https://github.com/s977043/river-review/commit/b4139f2367678ce677821e39006030d62c07b2ec))

## [1.18.1](https://github.com/s977043/river-review/compare/v1.18.0...v1.18.1) (2026-06-17)


### Bug Fixes

* single-source verdict in formatters via resolveVerdict ([#1170](https://github.com/s977043/river-review/issues/1170) F3) ([#1182](https://github.com/s977043/river-review/issues/1182)) ([d0df9ec](https://github.com/s977043/river-review/commit/d0df9ece11b4bc35cb2d08966e5a0bcac8fb1833))

## [1.18.0](https://github.com/s977043/river-review/compare/v1.17.0...v1.18.0) (2026-06-16)


### Features

* plan-review-gate hybrid (two-tier confidence + adjudicate I/F) ([#1170](https://github.com/s977043/river-review/issues/1170) F1, [#1171](https://github.com/s977043/river-review/issues/1171) item1) ([#1172](https://github.com/s977043/river-review/issues/1172)) ([e3c9c5a](https://github.com/s977043/river-review/commit/e3c9c5adce1532cf71eedadb716d55d712d394b4))
* suggestedLoopSignal 3-layer loop metadata ([#1171](https://github.com/s977043/river-review/issues/1171) item3) ([#1176](https://github.com/s977043/river-review/issues/1176)) ([4ab6efc](https://github.com/s977043/river-review/commit/4ab6efc766f8293c50c923cee953eb6a62a8c714))


### Bug Fixes

* connected-components mergeFindings + severity normalize ([#1170](https://github.com/s977043/river-review/issues/1170) F2/F4) ([#1174](https://github.com/s977043/river-review/issues/1174)) ([d3e8a1d](https://github.com/s977043/river-review/commit/d3e8a1dbfccc40b6eadd9fe331e95a610870deda))
* **differ:** NaN-safe timestamp sort + single-pass annotate ([#1170](https://github.com/s977043/river-review/issues/1170) F6/F7) ([#1175](https://github.com/s977043/river-review/issues/1175)) ([e46a0c2](https://github.com/s977043/river-review/commit/e46a0c2e8b6bd4d682659d204119c71155fa5c54))

## [1.17.0](https://github.com/s977043/river-review/compare/v1.16.0...v1.17.0) (2026-06-15)


### Features

* **output:** add --output html self-contained review report ([#1158](https://github.com/s977043/river-review/issues/1158) Phase 1) ([#1167](https://github.com/s977043/river-review/issues/1167)) ([7847559](https://github.com/s977043/river-review/commit/78475591e32c716d9d91b01b905f0ebce4b1f407))
* wire detectHumanApprovalTriggers into plan review (humanApprovalRequired) ([#1163](https://github.com/s977043/river-review/issues/1163)) ([#1168](https://github.com/s977043/river-review/issues/1168)) ([2eb6372](https://github.com/s977043/river-review/commit/2eb637256843f4a1e11ccc0abb0a9d7ac73072cd))

## [1.16.0](https://github.com/s977043/river-review/compare/v1.15.0...v1.16.0) (2026-06-15)


### Features

* mergeFindings contract for review team (severity-max / evidence-union / agreement) ([#1150](https://github.com/s977043/river-review/issues/1150) S3) ([#1165](https://github.com/s977043/river-review/issues/1165)) ([488b63b](https://github.com/s977043/river-review/commit/488b63bba506ec1144baeac1275e3c79c4b1a097))
* plan-review-gate foundation (humanApprovalRequired verdict + policy + skill) ([#1150](https://github.com/s977043/river-review/issues/1150) S4) ([#1164](https://github.com/s977043/river-review/issues/1164)) ([7b04e3b](https://github.com/s977043/river-review/commit/7b04e3bcc995a21fcc6da476a5b1f4d3ac077ccf))

## [1.15.0](https://github.com/s977043/river-review/compare/v1.14.0...v1.15.0) (2026-06-12)


### Features

* **cli:** add run-level decision (verdict) to river run --output json ([#1150](https://github.com/s977043/river-review/issues/1150) S1) ([#1152](https://github.com/s977043/river-review/issues/1152)) ([a176304](https://github.com/s977043/river-review/commit/a176304582740c15b4f81067545d1578dbf44a55))
* **runs:** detect finding oscillation across 3+ runs in runs diff ([#1150](https://github.com/s977043/river-review/issues/1150) S2b) ([#1156](https://github.com/s977043/river-review/issues/1156)) ([b1cef18](https://github.com/s977043/river-review/commit/b1cef18afa3defac9054274f97a2447c9e9d3218))


### Bug Fixes

* **schema:** define summary.prioritySummary in output.schema.json ([#1154](https://github.com/s977043/river-review/issues/1154)) ([#1155](https://github.com/s977043/river-review/issues/1155)) ([14ea2b3](https://github.com/s977043/river-review/commit/14ea2b3b181f63ffa346ce2cbf89f9ab83ad156b))

## [1.14.0](https://github.com/s977043/river-review/compare/v1.13.0...v1.14.0) (2026-06-11)


### Features

* **cli:** add --explain flag (skill / gate / config resolution) ([#1144](https://github.com/s977043/river-review/issues/1144)) ([76201c3](https://github.com/s977043/river-review/commit/76201c3292835ccfff408fbab72cebbfc678cfbe))
* **config:** add global ~/.river-review/ config tier (4-layer resolution) ([#1143](https://github.com/s977043/river-review/issues/1143)) ([e37c684](https://github.com/s977043/river-review/commit/e37c684598793812960aff93a89a5d1e5963e882))
* **hooks:** target-file-aware PostToolUse format path + hook input contract doc ([#1136](https://github.com/s977043/river-review/issues/1136)) ([72e7353](https://github.com/s977043/river-review/commit/72e7353276f74936763af7f8111acfd7b30705b9))
* **schema:** add decision / usage / trace to Review Artifact (v1 additive) ([#1142](https://github.com/s977043/river-review/issues/1142)) ([1b19b08](https://github.com/s977043/river-review/commit/1b19b087121506aa81e8dcaf8b04ba311c0614e4))
* **skills:** "Skills changed" release-notes section from manifest diff ([#1138](https://github.com/s977043/river-review/issues/1138)) ([65d0f7b](https://github.com/s977043/river-review/commit/65d0f7be05dc9589064a5790652daf50fc9726d6))


### Bug Fixes

* address multi-agent review findings on [#1045](https://github.com/s977043/river-review/issues/1045) (run_id contract + global config opt-out) ([#1145](https://github.com/s977043/river-review/issues/1145)) ([006933c](https://github.com/s977043/river-review/commit/006933c33e9b149ad8739d0e6d0b96a087baec8b))

## [1.13.0](https://github.com/s977043/river-review/compare/v1.12.0...v1.13.0) (2026-06-11)


### Features

* **skills:** add tailwind / vitest / firebase / nextjs technology review packs ([#1132](https://github.com/s977043/river-review/issues/1132)) ([4c0a3c4](https://github.com/s977043/river-review/commit/4c0a3c4562ac2b8fae29baba5df9008c128affa6))

## [1.12.0](https://github.com/s977043/river-review/compare/v1.11.0...v1.12.0) (2026-06-11)


### Features

* **skills:** add S1 fixtures and promote react-router/laravel/gha-security to community ([#1128](https://github.com/s977043/river-review/issues/1128)) ([b567c50](https://github.com/s977043/river-review/commit/b567c50570dd1b117168932b23a3e175b05c3214))

## [1.11.0](https://github.com/s977043/river-review/compare/v1.10.0...v1.11.0) (2026-06-11)


### Features

* **skills:** add react-router, laravel, and gha-security packs from official docs ([#1126](https://github.com/s977043/river-review/issues/1126)) ([99e6038](https://github.com/s977043/river-review/commit/99e603822fe342ae001acfcf1e2c772a799d9252))

## [1.10.0](https://github.com/s977043/river-review/compare/v1.9.0...v1.10.0) (2026-06-10)


### Features

* **cli:** deterministic skills resolve subcommand ([#1045](https://github.com/s977043/river-review/issues/1045)) ([#1121](https://github.com/s977043/river-review/issues/1121)) ([579aaf1](https://github.com/s977043/river-review/commit/579aaf19d7cbaa8baa3b437552308d4eaef7f3a3))
* **skills:** promote typescript pack to official, ddd to community ([#1120](https://github.com/s977043/river-review/issues/1120)) ([e04f707](https://github.com/s977043/river-review/commit/e04f707b871a899244d7caecff7e11a4b7d2b10d))

## [1.9.0](https://github.com/s977043/river-review/compare/v1.8.0...v1.9.0) (2026-06-10)


### Features

* **config:** selection section in .river-review.yaml (packs/tags/include/exclude) ([#1117](https://github.com/s977043/river-review/issues/1117)) ([5a9f2ba](https://github.com/s977043/river-review/commit/5a9f2ba29fbc4897f7ecf7c98f8cf646bed3e558))
* **loop:** per-skill FP regression signal and rule-promotion detection (L-4) ([#1118](https://github.com/s977043/river-review/issues/1118)) ([213c6e8](https://github.com/s977043/river-review/commit/213c6e8e6ee25c2c50327a2b161fdbc820b49f3d))

## [1.8.0](https://github.com/s977043/river-review/compare/v1.7.0...v1.8.0) (2026-06-10)


### Features

* **loop:** feedback capture CLI and feedback:apply scaffolder (L-2 P0) ([#1112](https://github.com/s977043/river-review/issues/1112)) ([06b625f](https://github.com/s977043/river-review/commit/06b625f0d2659394081380b08fafcc5e5439e7e4))
* **loop:** suppression analytics and nightly eval regression auto-issue (L-3) ([#1114](https://github.com/s977043/river-review/issues/1114)) ([39107db](https://github.com/s977043/river-review/commit/39107dbe50f873cf7b71303bff819e178bcc4a4c))
* **skills:** ddd pack with degraded mode and pack tier assessment (Phase C) ([#1113](https://github.com/s977043/river-review/issues/1113)) ([29913e3](https://github.com/s977043/river-review/commit/29913e3cc82faf6f7bcbca967ad6a00dc122c0ba))
* **skills:** pack resolver, pack schema, and first typescript pack (Phase B) ([#1111](https://github.com/s977043/river-review/issues/1111)) ([8445983](https://github.com/s977043/river-review/commit/84459833a5b9ddca16cdb837931cff286972bfe5))


### Bug Fixes

* **docs:** repair 5 broken links failing lychee on every PR ([#1108](https://github.com/s977043/river-review/issues/1108)) ([203fb31](https://github.com/s977043/river-review/commit/203fb310f24e3ec1d9820dc00e69f1669a25fa0c))
* **skills:** register 6 catalog-drifted skills in registry.yaml ([#1107](https://github.com/s977043/river-review/issues/1107)) ([8f7e4f4](https://github.com/s977043/river-review/commit/8f7e4f4d41a91c7da1e585774b2cb44fefd0e4e6))

## [1.7.0](https://github.com/s977043/river-review/compare/v1.6.1...v1.7.0) (2026-06-09)


### Features

* **skills:** deterministic skill manifest for drift detection ([#1016](https://github.com/s977043/river-review/issues/1016)) ([#1100](https://github.com/s977043/river-review/issues/1100)) ([d22cba9](https://github.com/s977043/river-review/commit/d22cba90706a045db47f794ae3d5a97d8b6b07b1))

## [1.6.1](https://github.com/s977043/river-review/compare/v1.6.0...v1.6.1) (2026-06-09)


### Bug Fixes

* align code and docs with the updated concept (audit follow-up) ([#1097](https://github.com/s977043/river-review/issues/1097)) ([99a78ce](https://github.com/s977043/river-review/commit/99a78ce628001a908d6fbc2177dfcb85b31b4623))

## [1.6.0](https://github.com/s977043/river-review/compare/v1.5.0...v1.6.0) (2026-06-09)


### Features

* **cli:** add --offline / --rules-only mode ([#1071](https://github.com/s977043/river-review/issues/1071), ADR-002) ([#1094](https://github.com/s977043/river-review/issues/1094)) ([3625170](https://github.com/s977043/river-review/commit/36251700faddefc9c8b0fc8d672ca30575843962))

## [1.5.0](https://github.com/s977043/river-review/compare/v1.4.0...v1.5.0) (2026-06-09)


### Features

* **#1068:** doc-only PR 用のレビュー観点を追加 ([#1089](https://github.com/s977043/river-review/issues/1089)) ([bc418d3](https://github.com/s977043/river-review/commit/bc418d33092b2ef6082cddaac6f66f6a481a5ed2)), closes [#1068](https://github.com/s977043/river-review/issues/1068)
* **#1069:** 重要度に「ドキュメント実害=Major」基準を追加 ([#1088](https://github.com/s977043/river-review/issues/1088)) ([db15135](https://github.com/s977043/river-review/commit/db151355bd840dabb5eb9def7a68d96b99949a0a)), closes [#1069](https://github.com/s977043/river-review/issues/1069)
* **#1070:** カスタム静的解析の False-positive 責務分界を review-core に明記 ([#1087](https://github.com/s977043/river-review/issues/1087)) ([3ed7ef8](https://github.com/s977043/river-review/commit/3ed7ef8c269da324a46460823b5dd95b38212a02)), closes [#1070](https://github.com/s977043/river-review/issues/1070)

## [1.4.0](https://github.com/s977043/river-review/compare/v1.3.1...v1.4.0) (2026-06-08)


### Features

* **action:** suppress empty boilerplate comment when no LLM key ([#1067](https://github.com/s977043/river-review/issues/1067)) ([#1077](https://github.com/s977043/river-review/issues/1077)) ([5251832](https://github.com/s977043/river-review/commit/5251832e59a2e2bf4ee212d67e29ff7c09d25658))
* **heuristic:** extend dangerous-eval (document.write, string-arg timers) ([#1085](https://github.com/s977043/river-review/issues/1085)) ([ca50d71](https://github.com/s977043/river-review/commit/ca50d71c7b0f12c18d1a6d96c84ac5a466af7ebb))
* **heuristic:** no-key dangerous-eval and focused-test checks ([#1080](https://github.com/s977043/river-review/issues/1080)) ([36073cd](https://github.com/s977043/river-review/commit/36073cd665ce76b98f7389af1843854a528aa1d4))
* **heuristic:** no-key debugger-leftover and insecure-tls checks ([#1081](https://github.com/s977043/river-review/issues/1081)) ([8abd36c](https://github.com/s977043/river-review/commit/8abd36c9171edbcad189ef98b7b2825e6d5355fc))
* **heuristic:** no-key disabled-test check (.skip / xit / xdescribe) ([#1083](https://github.com/s977043/river-review/issues/1083)) ([a774f8e](https://github.com/s977043/river-review/commit/a774f8e23d0ac4e1d4ec1b24f6b60db678bada1a))
* **heuristic:** no-key merge-conflict and ts-suppression checks ([#1082](https://github.com/s977043/river-review/issues/1082)) ([a27f781](https://github.com/s977043/river-review/commit/a27f781c7f2f0d8adbf46e1457c6417e4d3db462))
* **heuristic:** no-key weak-hash and command-injection checks ([#1084](https://github.com/s977043/river-review/issues/1084)) ([c5f4f16](https://github.com/s977043/river-review/commit/c5f4f16732d2c4d04a910a115ac8aa98c5bd1c5a))


### Bug Fixes

* **ci:** exclude generated CHANGELOG.md from lychee link check ([#1065](https://github.com/s977043/river-review/issues/1065)) ([#1078](https://github.com/s977043/river-review/issues/1078)) ([12fb260](https://github.com/s977043/river-review/commit/12fb26055ef9520a5dae4cd2223e0dcf994f5745))
* **run+docs:** wire --fail-on into river run + correct agent playbook (self-review) ([#1073](https://github.com/s977043/river-review/issues/1073)) ([edf6736](https://github.com/s977043/river-review/commit/edf67363eec12a177ae28644a5bf27a66ae0caf0))

## [1.3.1](https://github.com/s977043/river-review/compare/v1.3.0...v1.3.1) (2026-06-08)


### Bug Fixes

* **docs,agent:** spec drift + plugin-agent compliance (self-review) ([#1056](https://github.com/s977043/river-review/issues/1056)) ([7a461b3](https://github.com/s977043/river-review/commit/7a461b3b922155f189293861532a550e59f2812c))
* **docs:** complete spec --config/--output drift + [#996](https://github.com/s977043/river-review/issues/996) agent danglers (self-review r2) ([#1059](https://github.com/s977043/river-review/issues/1059)) ([b8d9c88](https://github.com/s977043/river-review/commit/b8d9c8817aacea580b2f02bc279433564461ad03))
* **docs:** repair docusaurus build (broken links + MDX import/export) ([#1061](https://github.com/s977043/river-review/issues/1061)) ([#1062](https://github.com/s977043/river-review/issues/1062)) ([8bd2ce6](https://github.com/s977043/river-review/commit/8bd2ce6adc69ece82d11be3283372a183d7d4822))
* **review:** honor --skill-set in review plan/exec ([#976](https://github.com/s977043/river-review/issues/976)/[#1027](https://github.com/s977043/river-review/issues/1027)) ([#1063](https://github.com/s977043/river-review/issues/1063)) ([69bf4e9](https://github.com/s977043/river-review/commit/69bf4e9e9307a454f6c741d03a78f59a2f90aa65))
* **review:** skip --skill-set resolution on the replay path ([#1063](https://github.com/s977043/river-review/issues/1063)) ([#1064](https://github.com/s977043/river-review/issues/1064)) ([9555e42](https://github.com/s977043/river-review/commit/9555e420039544eaf7fc5890c5bb99c572c92792))

## [1.3.0](https://github.com/s977043/river-review/compare/v1.2.2...v1.3.0) (2026-06-07)


### Features

* **976:** pre-exec review-gate skill set + design doc ([#1042](https://github.com/s977043/river-review/issues/1042)) ([d16cc53](https://github.com/s977043/river-review/commit/d16cc53d775581f11f5b0c6542da880f30ed1e0c))
* **cli:** add --base &lt;ref&gt; to river run for explicit diff base ([#1022](https://github.com/s977043/river-review/issues/1022)) ([#1028](https://github.com/s977043/river-review/issues/1028)) ([d1542d1](https://github.com/s977043/river-review/commit/d1542d1ad3a2260f0d75ddecfc7b66cc7fa55539))
* **cli:** add --depth to river run to force review depth ([#1025](https://github.com/s977043/river-review/issues/1025)) ([#1033](https://github.com/s977043/river-review/issues/1033)) ([d0baa09](https://github.com/s977043/river-review/commit/d0baa092b0734e71b384449155061e5aa7065ec3))
* **cli:** add --skill-set &lt;name&gt; to river run ([#1027](https://github.com/s977043/river-review/issues/1027)) ([#1030](https://github.com/s977043/river-review/issues/1030)) ([4d682d4](https://github.com/s977043/river-review/commit/4d682d43b0b22da0bb3fc6c4099bfec36e0dc49d))
* **review:** implement --output markdown for river review ([#976](https://github.com/s977043/river-review/issues/976) gap) ([#1046](https://github.com/s977043/river-review/issues/1046)) ([0c172e5](https://github.com/s977043/river-review/commit/0c172e55adb6e8a3552aceabac84aa4f954bdb35))
* **review:** opt-in --fail-on/--warn-on/--advisory-only gate ([#976](https://github.com/s977043/river-review/issues/976) gap) ([#1047](https://github.com/s977043/river-review/issues/1047)) ([5a33ec2](https://github.com/s977043/river-review/commit/5a33ec2ab4bbed1c01b2e5a9459e5814188ba80e))
* **review:** opt-in walkthrough & agent-handoff sections ([#1023](https://github.com/s977043/river-review/issues/1023)) ([#1040](https://github.com/s977043/river-review/issues/1040)) ([62fb10f](https://github.com/s977043/river-review/commit/62fb10f09fe5f20b7e9a5925afcebb380f8e42d2))
* **review:** report replay drift in debug.replay.drift ([#936](https://github.com/s977043/river-review/issues/936)) ([#1041](https://github.com/s977043/river-review/issues/1041)) ([20ea917](https://github.com/s977043/river-review/commit/20ea917e5f5f671a51490a974fcff0429239b030))
* **review:** review the PR description ([#1023](https://github.com/s977043/river-review/issues/1023) pr-description) ([#1037](https://github.com/s977043/river-review/issues/1037)) ([7250064](https://github.com/s977043/river-review/commit/7250064de0d32c9cc734b4ce17952db90748aee0))
* **rules:** load split rule files from .river/rules.d/*.md ([#1025](https://github.com/s977043/river-review/issues/1025)) ([#1032](https://github.com/s977043/river-review/issues/1032)) ([65b99e5](https://github.com/s977043/river-review/commit/65b99e55cc7c618beafb3269ab9fcbc84ff15004))
* **scoring:** add actionability axis to finding breakdown ([#1027](https://github.com/s977043/river-review/issues/1027)) ([#1039](https://github.com/s977043/river-review/issues/1039)) ([4210b75](https://github.com/s977043/river-review/commit/4210b75946c9f2e905040c0891f8e4d4eb69f34e))
* **skill:** add river-review-docs documentation review skill ([#990](https://github.com/s977043/river-review/issues/990)) ([#1014](https://github.com/s977043/river-review/issues/1014)) ([c4901a9](https://github.com/s977043/river-review/commit/c4901a94f2582a0e39fc769e42e7d537ca71134f))
* **skills:** add encapsulation/naming and over-abstraction guidance ([#1031](https://github.com/s977043/river-review/issues/1031)) ([1aa209b](https://github.com/s977043/river-review/commit/1aa209b919d32905f9e77745d46175c338ec9a71))
* **spec-link:** configurable spec/ADR dirs via review.specDirs ([#1022](https://github.com/s977043/river-review/issues/1022)) ([#1038](https://github.com/s977043/river-review/issues/1038)) ([1935411](https://github.com/s977043/river-review/commit/19354112ed658f401e578dbc8d17058a73f241b6))

## [1.2.2](https://github.com/s977043/river-review/compare/v1.2.1...v1.2.2) (2026-06-04)


### Bug Fixes

* **plugin:** address gemini-code-assist review of [#1004](https://github.com/s977043/river-review/issues/1004) ([#1006](https://github.com/s977043/river-review/issues/1006)) ([1e766c2](https://github.com/s977043/river-review/commit/1e766c26a1b192609088f63228894ae96baf26e0))
* **plugin:** make the distributed plugin CLI-independent and self-contained ([#1004](https://github.com/s977043/river-review/issues/1004)) ([a5f8ff3](https://github.com/s977043/river-review/commit/a5f8ff349aab313e7bf8e70b8a473fd6da3f96d2))

## [1.2.1](https://github.com/s977043/river-review/compare/v1.2.0...v1.2.1) (2026-06-04)


### Bug Fixes

* **plugin:** address Codex review of the distribution work ([#999](https://github.com/s977043/river-review/issues/999)) ([26171a6](https://github.com/s977043/river-review/commit/26171a6e628387fa50bac679e96726bd2cf3bae0)), closes [#966](https://github.com/s977043/river-review/issues/966)

## [1.2.0](https://github.com/s977043/river-review/compare/v1.1.0...v1.2.0) (2026-06-03)


### Features

* **plugin:** add Codex-native plugin manifest (.codex-plugin/plugin.json) ([#991](https://github.com/s977043/river-review/issues/991)) ([36364b6](https://github.com/s977043/river-review/commit/36364b618b6d7958e5fd14de4ea01467e45dab1e)), closes [#966](https://github.com/s977043/river-review/issues/966)


### Bug Fixes

* **codex:** vendor full agent-skills (with references/) in setup fallback ([#992](https://github.com/s977043/river-review/issues/992)) ([9ea121d](https://github.com/s977043/river-review/commit/9ea121d162f0576fb14e42c61dd46301958e1334)), closes [#966](https://github.com/s977043/river-review/issues/966)

## [1.1.0](https://github.com/s977043/river-review/compare/v1.0.0...v1.1.0) (2026-06-03)


### Features

* **agents:** wire community skills to routing, enrich agent defs, add self-example ([#973](https://github.com/s977043/river-review/issues/973)) ([cf54710](https://github.com/s977043/river-review/commit/cf547106faca1499e375d0b9615d4373f2fb709b))
* **codex:** one-command setup script (curl|bash installer) ([#984](https://github.com/s977043/river-review/issues/984)) ([b3b0e43](https://github.com/s977043/river-review/commit/b3b0e43b6ed4d63359e91fc6d01d2a7bb7ea9352))
* **plugin:** add self-contained format hook (official CLAUDE_PLUGIN_ROOT pattern) ([#982](https://github.com/s977043/river-review/issues/982)) ([1abcbd0](https://github.com/s977043/river-review/commit/1abcbd0f76636dca96feb752cb0377bf5f01171a))
* **plugin:** package river-review as a Claude Code plugin + Codex setup ([#981](https://github.com/s977043/river-review/issues/981)) ([e459e09](https://github.com/s977043/river-review/commit/e459e097245e4556038f05129884ef7bcd9a1135))


### Bug Fixes

* **docs:** correct doc/agent inaccuracies found in 3-perspective review ([#979](https://github.com/s977043/river-review/issues/979)) ([c21f566](https://github.com/s977043/river-review/commit/c21f5667c150c1bd8b2c26f8a315834f089f3b72))
* **docs:** correct ESLint refs in agent yaml and add agent-skills:validate to EN ([#980](https://github.com/s977043/river-review/issues/980)) ([0c13a41](https://github.com/s977043/river-review/commit/0c13a410a9854c53e5d6045117eb10500a55d8ea))

## [1.0.0](https://github.com/s977043/river-review/compare/v0.69.0...v1.0.0) (2026-06-01)


### ⚠ BREAKING CHANGES

* config file renamed from .river-reviewer.json to .river-review.json; agent skill IDs changed from river-reviewer* to river-review*.

### Features

* **docs+skills:** --reviewers auto docs, agent templates, skill version fixes ([#964](https://github.com/s977043/river-review/issues/964)) ([78c5566](https://github.com/s977043/river-review/commit/78c55662d3f2d04b5b378bd52372e5813b19b230))
* rename River Reviewer → River Review across entire codebase ([#967](https://github.com/s977043/river-review/issues/967)) ([050794c](https://github.com/s977043/river-review/commit/050794c68f33103effbc57d4961a031033bd0a9b))
* **skills:** add Figma design drift and component reuse guard skills ([#944](https://github.com/s977043/river-review/issues/944)) ([baa14bf](https://github.com/s977043/river-review/commit/baa14bf3a5ff53afd9e69a46ec890541e2912f2c))


### Bug Fixes

* post-rename cleanup and update public URL ([#969](https://github.com/s977043/river-review/issues/969)) ([8e8c81c](https://github.com/s977043/river-review/commit/8e8c81cbbbeebd9b61b295063799046faf559519))
* rename example workflow files and fix lychee user-agent ([#970](https://github.com/s977043/river-review/issues/970)) ([a639de7](https://github.com/s977043/river-review/commit/a639de70bb9568566c0ff82582d1210e16fb96b5))
* update stale docs, action yaml validation, and promote design skills ([#950](https://github.com/s977043/river-review/issues/950)) ([ae49569](https://github.com/s977043/river-review/commit/ae49569b4f0b0fe8cc088d526bdb435d4629e832))

## [0.69.0](https://github.com/s977043/river-reviewer/compare/v0.68.0...v0.69.0) (2026-05-29)


### Features

* **dist:** add npm publish workflow and publishConfig for runner packages ([#800](https://github.com/s977043/river-reviewer/issues/800)) ([#942](https://github.com/s977043/river-reviewer/issues/942)) ([bb635b4](https://github.com/s977043/river-reviewer/commit/bb635b4cd0931f9603f564bc8097a96a0be16e90))
* **skills:** promote 7 community skills to recommended:true ([#929](https://github.com/s977043/river-reviewer/issues/929)) ([#940](https://github.com/s977043/river-reviewer/issues/940)) ([09f5617](https://github.com/s977043/river-reviewer/commit/09f561744eaa1a391ce5cc113c075254579eee56))

## [0.68.0](https://github.com/s977043/river-reviewer/compare/v0.67.0...v0.68.0) (2026-05-28)


### Features

* **cli:** --plan replay execution wires generateReview ([#878](https://github.com/s977043/river-reviewer/issues/878) A2-3-impl) ([#935](https://github.com/s977043/river-reviewer/issues/935)) ([f74fa0a](https://github.com/s977043/river-reviewer/commit/f74fa0add52e4bf07f1b6d81ba522c447227e927))

## [0.67.0](https://github.com/s977043/river-reviewer/compare/v0.66.0...v0.67.0) (2026-05-28)


### Features

* **runners:** buildExecutionPlan emits snapshot carry-over ([#878](https://github.com/s977043/river-reviewer/issues/878) A2-3-runners) ([#933](https://github.com/s977043/river-reviewer/issues/933)) ([34bf00c](https://github.com/s977043/river-reviewer/commit/34bf00c3fcc4833f28334f3ab78dc9db588758ec))

## [0.66.0](https://github.com/s977043/river-reviewer/compare/v0.65.0...v0.66.0) (2026-05-28)


### Features

* **scripts:** offline promptfoo config validator ([#929](https://github.com/s977043/river-reviewer/issues/929) advance, no API key) ([#931](https://github.com/s977043/river-reviewer/issues/931)) ([c2c74ab](https://github.com/s977043/river-reviewer/commit/c2c74ab8308ed3bea3647c801bce27b2742fe071))

## [0.65.0](https://github.com/s977043/river-reviewer/compare/v0.64.0...v0.65.0) (2026-05-27)


### Features

* **scripts:** local promptfoo eval helper + runbook reorientation ([#868](https://github.com/s977043/river-reviewer/issues/868)) ([#926](https://github.com/s977043/river-reviewer/issues/926)) ([62bc147](https://github.com/s977043/river-reviewer/commit/62bc147c0d3e8289f5163fd909703b60758a7c39))

## [0.64.0](https://github.com/s977043/river-reviewer/compare/v0.63.0...v0.64.0) (2026-05-27)


### Features

* **actions:** promptfoo eval workflow + runbook for community skills ([#868](https://github.com/s977043/river-reviewer/issues/868) Phase 3) ([#924](https://github.com/s977043/river-reviewer/issues/924)) ([40009f2](https://github.com/s977043/river-reviewer/commit/40009f21e37fa76a05fa8242a2cc3aa997ca1e4b))

## [0.63.0](https://github.com/s977043/river-reviewer/compare/v0.62.0...v0.63.0) (2026-05-27)


### Features

* **schemas:** debug.execution.snapshot carry-over field ([#878](https://github.com/s977043/river-reviewer/issues/878) A2-3-pre) ([#922](https://github.com/s977043/river-reviewer/issues/922)) ([7c7e1e5](https://github.com/s977043/river-reviewer/commit/7c7e1e592f832b092ed032ee363ddec89f6600d9))

## [0.62.0](https://github.com/s977043/river-reviewer/compare/v0.61.0...v0.62.0) (2026-05-27)


### Features

* **skills:** community skill fixtures slice 3/3 ([#868](https://github.com/s977043/river-reviewer/issues/868) — a11y-interactive + nextjs) ([#919](https://github.com/s977043/river-reviewer/issues/919)) ([965324a](https://github.com/s977043/river-reviewer/commit/965324a8ec5c823f82c69b94ab58675921abe408))

## [0.61.0](https://github.com/s977043/river-reviewer/compare/v0.60.0...v0.61.0) (2026-05-27)


### Features

* **cli:** --ensemble flag for synthesis ([#911](https://github.com/s977043/river-reviewer/issues/911) Phase 3 Slice B) ([#917](https://github.com/s977043/river-reviewer/issues/917)) ([8a72621](https://github.com/s977043/river-reviewer/commit/8a726211521793bf78b4e0718a2f61528a7584d4))

## [0.60.0](https://github.com/s977043/river-reviewer/compare/v0.59.0...v0.60.0) (2026-05-27)


### Features

* **schemas:** synthesis provenance fields + reviewer input contexts ([#911](https://github.com/s977043/river-reviewer/issues/911) Phase 2) ([#914](https://github.com/s977043/river-reviewer/issues/914)) ([28883e1](https://github.com/s977043/river-reviewer/commit/28883e10eff7c57732b04582bd370fbe397488f8))

## [0.59.0](https://github.com/s977043/river-reviewer/compare/v0.58.0...v0.59.0) (2026-05-27)


### Features

* **skills:** independent review synthesis skill ([#911](https://github.com/s977043/river-reviewer/issues/911) Phase 1) ([#912](https://github.com/s977043/river-reviewer/issues/912)) ([543a73d](https://github.com/s977043/river-reviewer/commit/543a73d13e735038f616c4b6ef303f572e3400a8))

## [0.58.0](https://github.com/s977043/river-reviewer/compare/v0.57.0...v0.58.0) (2026-05-27)


### Features

* **skills:** community skill fixtures slice 2/3 (browser-compat + performance) ([#909](https://github.com/s977043/river-reviewer/issues/909)) ([99ec9c3](https://github.com/s977043/river-reviewer/commit/99ec9c33cbf38cf8a46fceea5be5780c2cd949e7))


### Bug Fixes

* **ci:** kick workflow requires RELEASE_KICK_PAT + loud failure mode ([#906](https://github.com/s977043/river-reviewer/issues/906)) ([#907](https://github.com/s977043/river-reviewer/issues/907)) ([998a6b1](https://github.com/s977043/river-reviewer/commit/998a6b1f1ee39f8110b5d966055ba7d43cbc822d))

## [0.57.0](https://github.com/s977043/river-reviewer/compare/v0.56.0...v0.57.0) (2026-05-25)


### Features

* **skills:** add fixtures + eval scaffolding for 2 community skills (S4 slice) ([#905](https://github.com/s977043/river-reviewer/issues/905)) ([96c1e29](https://github.com/s977043/river-reviewer/commit/96c1e29a10d085c38079905dca80754e1d7038c4))


### Bug Fixes

* **process:** harden kick automation + add Stop-rule reopen conditions ([#902](https://github.com/s977043/river-reviewer/issues/902)) ([06fcebe](https://github.com/s977043/river-reviewer/commit/06fcebe4869986f5e297e8af18e2fc494f7b40c7))

## [0.56.0](https://github.com/s977043/river-reviewer/compare/v0.55.0...v0.56.0) (2026-05-25)


### Features

* **registry:** add community section with recommended:false for 6 skills (S3) ([#899](https://github.com/s977043/river-reviewer/issues/899)) ([e67ec5b](https://github.com/s977043/river-reviewer/commit/e67ec5bde5ec7b252c97ef379754fdf0318d934b))

## [0.55.0](https://github.com/s977043/river-reviewer/compare/v0.54.0...v0.55.0) (2026-05-23)


### Features

* **skill:** add modern-web-a11y-interactive community skill ([#868](https://github.com/s977043/river-reviewer/issues/868) Phase 1) ([#884](https://github.com/s977043/river-reviewer/issues/884)) ([6283147](https://github.com/s977043/river-reviewer/commit/62831472160c0f6ba67f768ebcb8860b63eee46e))

## [0.54.0](https://github.com/s977043/river-reviewer/compare/v0.53.0...v0.54.0) (2026-05-22)


### Features

* **skill:** add modern-web-browser-compat community skill ([#868](https://github.com/s977043/river-reviewer/issues/868) Phase 1) ([#881](https://github.com/s977043/river-reviewer/issues/881)) ([4c46142](https://github.com/s977043/river-reviewer/commit/4c46142006375123e8f1079f6f51869d334598d2))

## [0.53.0](https://github.com/s977043/river-reviewer/compare/v0.52.0...v0.53.0) (2026-05-22)


### Features

* **skill:** add modern-web-performance community skill ([#868](https://github.com/s977043/river-reviewer/issues/868) Phase 1) ([#875](https://github.com/s977043/river-reviewer/issues/875)) ([9e2a24c](https://github.com/s977043/river-reviewer/commit/9e2a24c5357fab44ca2bcc624ef405b7d1749ce5))


### Bug Fixes

* **cli:** propagate riskAssessment on review exec path ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3 A2-fix-4) ([#877](https://github.com/s977043/river-reviewer/issues/877)) ([f73e64e](https://github.com/s977043/river-reviewer/commit/f73e64ed3a38734508037cef8022c7d6a81df26b))

## [0.52.0](https://github.com/s977043/river-reviewer/compare/v0.51.1...v0.52.0) (2026-05-22)


### Features

* **skill:** add modern-web-semantic community skill ([#868](https://github.com/s977043/river-reviewer/issues/868) Phase 1 MVP) ([#873](https://github.com/s977043/river-reviewer/issues/873)) ([cf1ed5b](https://github.com/s977043/river-reviewer/commit/cf1ed5b6aca6ec0934b79b570dd2cdc58e9aed74))

## [0.51.1](https://github.com/s977043/river-reviewer/compare/v0.51.0...v0.51.1) (2026-05-21)


### Bug Fixes

* **cli:** forward fileTypes/relatedADRs/reviewMode to generateReview ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3 A2-fix-3) ([#871](https://github.com/s977043/river-reviewer/issues/871)) ([74b6c6f](https://github.com/s977043/river-reviewer/commit/74b6c6f581e584b50620ca7e26e0fe82ccef5dcf))
* **cli:** propagate availableDependencies to plan layer ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3 A2-fix-2) ([#869](https://github.com/s977043/river-reviewer/issues/869)) ([40a01bb](https://github.com/s977043/river-reviewer/commit/40a01bb9ef89b8f9cb9e9e9864b09aa551712a78))

## [0.51.0](https://github.com/s977043/river-reviewer/compare/v0.50.0...v0.51.0) (2026-05-21)


### Features

* **cli:** river review exec --plan replay foundation ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3) ([#861](https://github.com/s977043/river-reviewer/issues/861)) ([9445a7a](https://github.com/s977043/river-reviewer/commit/9445a7a7b85cdb214238c692ac335b0171d6d0cb))
* **cli:** river review exec deferred execution path ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3 A1) ([#863](https://github.com/s977043/river-reviewer/issues/863)) ([0e246d7](https://github.com/s977043/river-reviewer/commit/0e246d726331554f8573bc0d0067d7ddafc2af49))
* **cli:** river review exec generateReview adapter ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3 A2-1) ([#864](https://github.com/s977043/river-reviewer/issues/864)) ([66943b3](https://github.com/s977043/river-reviewer/commit/66943b313a5d6c07203aac84fe60ace7d2f85a74))


### Bug Fixes

* **cli:** propagate availableContexts to plan layer ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3 A2-fix-1) ([#865](https://github.com/s977043/river-reviewer/issues/865)) ([074db50](https://github.com/s977043/river-reviewer/commit/074db50344522fd0ad477c0f94783ae83a80cca5))

## [0.50.0](https://github.com/s977043/river-reviewer/compare/v0.49.0...v0.50.0) (2026-05-18)


### Features

* **cli:** river review exec --dry-run foundation ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3) ([#857](https://github.com/s977043/river-reviewer/issues/857)) ([d9ba92b](https://github.com/s977043/river-reviewer/commit/d9ba92b3b575675683d08b15f2e5ef96201198b2))

## [0.49.0](https://github.com/s977043/river-reviewer/compare/v0.48.0...v0.49.0) (2026-05-18)


### Features

* **cli:** exec/verify parser/dispatch contract foundation ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3 PR-3) ([#855](https://github.com/s977043/river-reviewer/issues/855)) ([c4d7527](https://github.com/s977043/river-reviewer/commit/c4d75276c1a2885b4b955f774df6863e54ad3362))

## [0.48.0](https://github.com/s977043/river-reviewer/compare/v0.47.0...v0.48.0) (2026-05-18)


### Features

* **cli:** honor --output/--format in river review plan ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3 PR-2) ([#852](https://github.com/s977043/river-reviewer/issues/852)) ([616a3ab](https://github.com/s977043/river-reviewer/commit/616a3abb3d0b4c1a5f4c31c83f66d4080faa8ee5))

## [0.47.0](https://github.com/s977043/river-reviewer/compare/v0.46.0...v0.47.0) (2026-05-17)


### Features

* **cli:** --summary-file and --quiet for river review plan ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3) ([#849](https://github.com/s977043/river-reviewer/issues/849)) ([9ec7460](https://github.com/s977043/river-reviewer/commit/9ec7460cb6857eea8217c7cff8b5dca6c8721a3b))

## [0.46.0](https://github.com/s977043/river-reviewer/compare/v0.45.0...v0.46.0) (2026-05-17)


### Features

* **cli:** deterministic skill selection for river review plan ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3 B-1) ([#847](https://github.com/s977043/river-reviewer/issues/847)) ([b6ee913](https://github.com/s977043/river-reviewer/commit/b6ee913fbfc5ccb60cb68bc8c5566d2f0582e562))

## [0.45.0](https://github.com/s977043/river-reviewer/compare/v0.44.0...v0.45.0) (2026-05-17)


### Features

* **cli:** wire river review plan --plan-only into main CLI ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 3) ([#839](https://github.com/s977043/river-reviewer/issues/839)) ([61028f6](https://github.com/s977043/river-reviewer/commit/61028f693c03493352cb3d5cd9b4f2f165bf9034))

## [0.44.0](https://github.com/s977043/river-reviewer/compare/v0.43.0...v0.44.0) (2026-05-17)


### Features

* **config:** artifact resolver + findings-pool 整合 ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 2b) ([#838](https://github.com/s977043/river-reviewer/issues/838)) ([e18b4e2](https://github.com/s977043/river-reviewer/commit/e18b4e264468950eae2d99713af57d4b071648e7))
* **config:** artifacts.* 設定スキーマ追加 ([#802](https://github.com/s977043/river-reviewer/issues/802) Phase 2a) ([#835](https://github.com/s977043/river-reviewer/issues/835)) ([e67960d](https://github.com/s977043/river-reviewer/commit/e67960d4364be820a7302c674847957702cb18cd))

## [0.43.0](https://github.com/s977043/river-reviewer/compare/v0.42.0...v0.43.0) (2026-05-17)


### Features

* **ai:** add Anthropic (Claude) provider to AIClientFactory ([1f4c16e](https://github.com/s977043/river-reviewer/commit/1f4c16ed5b6f829fd9e0c0e855bae340d2181aeb)), closes [#804](https://github.com/s977043/river-reviewer/issues/804)
* **ai:** allow per-skill opt-out of Anthropic prompt caching ([032537e](https://github.com/s977043/river-reviewer/commit/032537ea012179022c967839543f50e65003f96e))
* **ai:** capture Anthropic usage telemetry per call (Phase 1) ([24a4299](https://github.com/s977043/river-reviewer/commit/24a42996a0477667a3102ec33b4d7925943b05c4))
* **ai:** enable Anthropic prompt caching for system prompts ([5a344ff](https://github.com/s977043/river-reviewer/commit/5a344fffcd4b62f8203586e26ec5082e9f77c1a7))
* **ai:** finish Anthropic provider leftover hardening (3 items) ([21370aa](https://github.com/s977043/river-reviewer/commit/21370aa2ab3db8f4dd2c05654b433bf33bf695ad))
* **ai:** harden Anthropic provider — generateReview tests, max_tokens config, retry-after ([5099da7](https://github.com/s977043/river-reviewer/commit/5099da72cdd3f3808251ca9b1fde9ba0dcff5eb9)), closes [#808](https://github.com/s977043/river-reviewer/issues/808)
* **ai:** usage telemetry Phase 2 — OpenAI capture + JSONL persistence ([d94fcc9](https://github.com/s977043/river-reviewer/commit/d94fcc96ea3a749bef60c16cc025c330803ae72e))

## [0.42.0](https://github.com/s977043/river-reviewer/compare/v0.41.0...v0.42.0) (2026-05-07)


### Features

* **schema,eval:** allow license field; add per-skill FP rate snapshot ([#792](https://github.com/s977043/river-reviewer/issues/792)) ([632cc76](https://github.com/s977043/river-reviewer/commit/632cc765b5289a5c9f334561b80783b4e8acdd67))

## [0.41.0](https://github.com/s977043/river-reviewer/compare/v0.40.0...v0.41.0) (2026-05-07)


### Features

* **eval:** add severity + top1 ledger snapshots (EOS Phase 2.1/2.2) ([#790](https://github.com/s977043/river-reviewer/issues/790)) ([8ed8420](https://github.com/s977043/river-reviewer/commit/8ed8420b5e57aaeff645243f7237f6e07ba15784))

## [0.40.0](https://github.com/s977043/river-reviewer/compare/v0.39.0...v0.40.0) (2026-05-07)


### Features

* **eval:** add eval:compare ledger comparison + EOS Phase 2 doc accuracy ([#788](https://github.com/s977043/river-reviewer/issues/788)) ([a938e68](https://github.com/s977043/river-reviewer/commit/a938e68febad5dbb84f4225e1496815c17864434))

## [0.39.0](https://github.com/s977043/river-reviewer/compare/v0.38.0...v0.39.0) (2026-05-07)


### Features

* **eos:** codify 5-layer EOS structure + agent-skills license:MIT ([#786](https://github.com/s977043/river-reviewer/issues/786)) ([f702b6b](https://github.com/s977043/river-reviewer/commit/f702b6b98d54a7dc5a56e1402983bc6fb0785a7e))

## [0.38.0](https://github.com/s977043/river-reviewer/compare/v0.37.0...v0.38.0) (2026-05-07)


### Features

* **eval:** expand expectedTop1 coverage from 13 to 31 cases (audit follow-up) ([#783](https://github.com/s977043/river-reviewer/issues/783)) ([55f57f1](https://github.com/s977043/river-reviewer/commit/55f57f1a5db43ebe9d6a2481e76881e68cd98794))

## [0.37.0](https://github.com/s977043/river-reviewer/compare/v0.36.0...v0.37.0) (2026-05-07)


### Features

* **eval:** add planner-dataset coverage batch 5 + clarify agent-tag exclusion ([#780](https://github.com/s977043/river-reviewer/issues/780)) ([f6ad68d](https://github.com/s977043/river-reviewer/commit/f6ad68dbb4e584874f4ac941e1c66ff2a88e4021))

## [0.36.0](https://github.com/s977043/river-reviewer/compare/v0.35.0...v0.36.0) (2026-05-07)


### Features

* **eval:** add planner-dataset coverage batch 4 (5 more never-selected skills) ([#778](https://github.com/s977043/river-reviewer/issues/778)) ([e775c4e](https://github.com/s977043/river-reviewer/commit/e775c4eb0b99af18f1c2afba6a2b597211af5eeb))

## [0.35.0](https://github.com/s977043/river-reviewer/compare/v0.34.0...v0.35.0) (2026-05-07)


### Features

* **eval:** add planner-dataset coverage batch 3 (5 more never-selected skills) ([#774](https://github.com/s977043/river-reviewer/issues/774)) ([06d14d8](https://github.com/s977043/river-reviewer/commit/06d14d855f59b1d21d6e24f8c2b3378e3727d235))

## [0.34.0](https://github.com/s977043/river-reviewer/compare/v0.33.0...v0.34.0) (2026-05-07)


### Features

* **eval:** add planner-dataset coverage for 5 never-selected upstream skills ([#771](https://github.com/s977043/river-reviewer/issues/771)) ([c194ad4](https://github.com/s977043/river-reviewer/commit/c194ad44471c32e3be08b68d75b9356a6da1e4d1))

## [0.33.0](https://github.com/s977043/river-reviewer/compare/v0.32.0...v0.33.0) (2026-05-06)


### Features

* **eval:** add routing/planner eval cases for river-reviewer entry skill ([#763](https://github.com/s977043/river-reviewer/issues/763)) ([599edae](https://github.com/s977043/river-reviewer/commit/599edae42b8fa769299ae3e98224ffe9105bc0d7))

## [0.32.0](https://github.com/s977043/river-reviewer/compare/v0.31.0...v0.32.0) (2026-05-06)


### Features

* **skills:** add eval-driven-skill-design ([#737](https://github.com/s977043/river-reviewer/issues/737)) ([#759](https://github.com/s977043/river-reviewer/issues/759)) ([c41f065](https://github.com/s977043/river-reviewer/commit/c41f06526e47419666c2e54202ed06166582b47c))

## [0.31.0](https://github.com/s977043/river-reviewer/compare/v0.30.0...v0.31.0) (2026-05-06)


### Features

* **skills:** redefine river-reviewer as improvement-loop orchestrator ([#744](https://github.com/s977043/river-reviewer/issues/744) [#745](https://github.com/s977043/river-reviewer/issues/745)) ([#755](https://github.com/s977043/river-reviewer/issues/755)) ([658d039](https://github.com/s977043/river-reviewer/commit/658d0396d92fd1b31b55054930cace355c7a43da))

## [0.30.0](https://github.com/s977043/river-reviewer/compare/v0.29.0...v0.30.0) (2026-05-06)


### Features

* **skills:** add context-budget-tuning skill ([#742](https://github.com/s977043/river-reviewer/issues/742)) ([22704a6](https://github.com/s977043/river-reviewer/commit/22704a6201e2278e8a6a3075844906d160d48889))

## [0.29.0](https://github.com/s977043/river-reviewer/compare/v0.28.1...v0.29.0) (2026-04-30)


### Features

* **skills:** add suppression-feedback workflow guidance skill ([#735](https://github.com/s977043/river-reviewer/issues/735)) ([d1ecab4](https://github.com/s977043/river-reviewer/commit/d1ecab4c9d05da7649c86e28856aa2484ec8b89f))

## [0.28.1](https://github.com/s977043/river-reviewer/compare/v0.28.0...v0.28.1) (2026-04-30)


### Bug Fixes

* **ranker:** align DEFAULT_WEIGHTS keys + signal function names with schema ([#728](https://github.com/s977043/river-reviewer/issues/728)) ([e7e463e](https://github.com/s977043/river-reviewer/commit/e7e463e61e2e1fad6821de001389dcf65f22d5ac))

## [0.28.0](https://github.com/s977043/river-reviewer/compare/v0.27.0...v0.28.0) (2026-04-30)


### Features

* **context:** add reviewMode preset budgets ([#689](https://github.com/s977043/river-reviewer/issues/689) PR-D) ([#721](https://github.com/s977043/river-reviewer/issues/721)) ([1be3880](https://github.com/s977043/river-reviewer/commit/1be3880606d4ee4a8a15fa9be9a6b5c43e461f57))
* **eval:** integrate repo-context eval into evaluate-all + nightly ([#688](https://github.com/s977043/river-reviewer/issues/688) PR-4) ([#722](https://github.com/s977043/river-reviewer/issues/722)) ([5db6e23](https://github.com/s977043/river-reviewer/commit/5db6e2361278c464424c84c5d84d06260f0f30b5))

## [0.27.0](https://github.com/s977043/river-reviewer/compare/v0.26.0...v0.27.0) (2026-04-30)


### Features

* **context:** integrate ranker + token budget into collectRepoContext ([#689](https://github.com/s977043/river-reviewer/issues/689) PR-C) ([#719](https://github.com/s977043/river-reviewer/issues/719)) ([c3356d7](https://github.com/s977043/river-reviewer/commit/c3356d7acf800d99221906a3bb2ea7cdefa02667))
* **eval:** add 3 guard fixtures and falsePositiveRate metric ([#688](https://github.com/s977043/river-reviewer/issues/688) PR-3) ([#718](https://github.com/s977043/river-reviewer/issues/718)) ([bb0ddd9](https://github.com/s977043/river-reviewer/commit/bb0ddd9504c87a26ef7f9ea3e45684bad91adf39))

## [0.26.0](https://github.com/s977043/river-reviewer/compare/v0.25.0...v0.26.0) (2026-04-30)


### Features

* **context:** add context-ranker pure functions ([#689](https://github.com/s977043/river-reviewer/issues/689) PR-B) ([#714](https://github.com/s977043/river-reviewer/issues/714)) ([92d9eea](https://github.com/s977043/river-reviewer/commit/92d9eea084c7e1e53f16ce8394054978473b7b21))
* **eval:** add 4 should-detect fixtures across cross-context categories ([#688](https://github.com/s977043/river-reviewer/issues/688) PR-2) ([#715](https://github.com/s977043/river-reviewer/issues/715)) ([63f6a3f](https://github.com/s977043/river-reviewer/commit/63f6a3fced032c91e6d60243955560f4671477b9))

## [0.25.0](https://github.com/s977043/river-reviewer/compare/v0.24.0...v0.25.0) (2026-04-30)


### Features

* **context:** add token-estimator and context.* config schema ([#689](https://github.com/s977043/river-reviewer/issues/689) PR-A) ([#712](https://github.com/s977043/river-reviewer/issues/712)) ([2514d6a](https://github.com/s977043/river-reviewer/commit/2514d6acb8b4c59e11950610c28284cab734eb45))
* **eval:** add repo-wide review regression fixtures harness ([#688](https://github.com/s977043/river-reviewer/issues/688) PR-1) ([#711](https://github.com/s977043/river-reviewer/issues/711)) ([3b61fbc](https://github.com/s977043/river-reviewer/commit/3b61fbc1148add2291d67e87150315b54546ae7e))

## [0.24.0](https://github.com/s977043/river-reviewer/compare/v0.23.0...v0.24.0) (2026-04-30)


### Features

* **memory:** add `river suppression add` CLI + memory.suppressionEnabled ([#687](https://github.com/s977043/river-reviewer/issues/687) PR-D) ([#708](https://github.com/s977043/river-reviewer/issues/708)) ([9e30fc2](https://github.com/s977043/river-reviewer/commit/9e30fc25cc30a87c3470317c2df712601dcf6be7))
* **security:** redact prompt at the artifact boundary ([#692](https://github.com/s977043/river-reviewer/issues/692) PR-D) ([#707](https://github.com/s977043/river-reviewer/issues/707)) ([9f7c1bd](https://github.com/s977043/river-reviewer/commit/9f7c1bdf6e6a6069ac87f698f03fbd0b2ce8b8ea))

## [0.23.0](https://github.com/s977043/river-reviewer/compare/v0.22.0...v0.23.0) (2026-04-30)


### Features

* **memory:** wire applySuppressions into runLocalReview ([#687](https://github.com/s977043/river-reviewer/issues/687) PR-C) ([#701](https://github.com/s977043/river-reviewer/issues/701)) ([610d810](https://github.com/s977043/river-reviewer/commit/610d81046315dfb1f64521c08f3f80e0c69d9d22))
* **security:** add security.redact zod schema and JSON Schema ([#692](https://github.com/s977043/river-reviewer/issues/692) PR-B) ([#702](https://github.com/s977043/river-reviewer/issues/702)) ([2839029](https://github.com/s977043/river-reviewer/commit/2839029cb81df868f354d8fae9523c47f262c1c9))
* **security:** integrate redactText into collectRepoContext ([#692](https://github.com/s977043/river-reviewer/issues/692) PR-C) ([#704](https://github.com/s977043/river-reviewer/issues/704)) ([5a57f53](https://github.com/s977043/river-reviewer/commit/5a57f5341b9b2a95e667b244aa06acaa24118907))

## [0.22.0](https://github.com/s977043/river-reviewer/compare/v0.21.0...v0.22.0) (2026-04-30)


### Features

* **memory:** add applySuppressions pure function ([#687](https://github.com/s977043/river-reviewer/issues/687) PR-B) ([#699](https://github.com/s977043/river-reviewer/issues/699)) ([396f584](https://github.com/s977043/river-reviewer/commit/396f5841944afa04b522c80ef5f2e622d57786cc))
* **security:** add secret-redactor library and deny-glob defaults ([#692](https://github.com/s977043/river-reviewer/issues/692) PR-A) ([#698](https://github.com/s977043/river-reviewer/issues/698)) ([d20e1e3](https://github.com/s977043/river-reviewer/commit/d20e1e3ff4b9563520fc9618fc4c0a79dad01666))

## [0.21.0](https://github.com/s977043/river-reviewer/compare/v0.20.1...v0.21.0) (2026-04-28)


### Features

* **memory:** add suppression context schema and feedback fields ([#687](https://github.com/s977043/river-reviewer/issues/687) PR-A) ([#695](https://github.com/s977043/river-reviewer/issues/695)) ([6f27a6b](https://github.com/s977043/river-reviewer/commit/6f27a6b2353396923a074911943abac3a623bb44))

## [0.20.1](https://github.com/s977043/river-reviewer/compare/v0.20.0...v0.20.1) (2026-04-26)


### Bug Fixes

* **guards:** correct rebase bash example and peerDeps check recommendation ([#684](https://github.com/s977043/river-reviewer/issues/684)) ([613f129](https://github.com/s977043/river-reviewer/commit/613f129fe512f2a614961011e713ccd93cf057fe))

## [0.20.0](https://github.com/s977043/river-reviewer/compare/v0.19.0...v0.20.0) (2026-04-26)


### Features

* **github:** add inline_comments input for per-line review comments ([#675](https://github.com/s977043/river-reviewer/issues/675)) ([45c63d2](https://github.com/s977043/river-reviewer/commit/45c63d255efe79678fdd028c8a970f6e1c78fe91))
* **node-api:** add concurrency limit to parallel skill execution ([#678](https://github.com/s977043/river-reviewer/issues/678)) ([dc238b8](https://github.com/s977043/river-reviewer/commit/dc238b88842f9849ad48ca31d243fd94fc015637))
* **node-api:** implement AI provider execution in review() and evaluateSkill() ([#655](https://github.com/s977043/river-reviewer/issues/655)) ([ad9c295](https://github.com/s977043/river-reviewer/commit/ad9c2953bf8e4ef633fc190bcc93fb911870bff9))
* **node-api:** improve per-file finding attribution in parseFindings ([#679](https://github.com/s977043/river-reviewer/issues/679)) ([1b46c64](https://github.com/s977043/river-reviewer/commit/1b46c64b06a91b066c406a6cbf8d2944edbf9992)), closes [#657](https://github.com/s977043/river-reviewer/issues/657)
* **review:** add P1/P2/P3/P4 priority display to markdown output ([#677](https://github.com/s977043/river-reviewer/issues/677)) ([56eb93d](https://github.com/s977043/river-reviewer/commit/56eb93d1a589462101efd3cd70ed2b09a0b8cdfb))
* **skills:** add Greptile-inspired cross-context core skills ([fb18e7f](https://github.com/s977043/river-reviewer/commit/fb18e7ff80e469e281879c6f53a9a1e5b9acdc77))
* **skills:** add Greptile-inspired cross-context core skills ([#654](https://github.com/s977043/river-reviewer/issues/654)) ([3a36d5a](https://github.com/s977043/river-reviewer/commit/3a36d5a12cf2d1b58a2d6ad7296c206d4a48008a))
* **skills:** add Greptile-inspired cross-context core skills ([#654](https://github.com/s977043/river-reviewer/issues/654)) ([d192cc9](https://github.com/s977043/river-reviewer/commit/d192cc9c2b8dd52f16732a97cc3b3c3321ec8b13))

## [0.19.0](https://github.com/s977043/river-reviewer/compare/v0.18.0...v0.19.0) (2026-04-26)


### Features

* **eval:** add Phase 3 skill fixtures for typescript-nullcheck and typescript-strict ([#648](https://github.com/s977043/river-reviewer/issues/648)) ([bbc0b61](https://github.com/s977043/river-reviewer/commit/bbc0b612e148127eb9a3fd332e608b496f6ad82a))

## [0.18.0](https://github.com/s977043/river-reviewer/compare/v0.17.2...v0.18.0) (2026-04-25)


### Features

* **eval:** enable skill eval CI gate (Phase 3) ([#646](https://github.com/s977043/river-reviewer/issues/646)) ([92c26ee](https://github.com/s977043/river-reviewer/commit/92c26eef3455fb4ee751c14fc8729fce923bf9c3))

## [0.17.2](https://github.com/s977043/river-reviewer/compare/v0.17.1...v0.17.2) (2026-04-25)


### Bug Fixes

* **eval:** redirect sub-eval progress to stderr to fix nightly CI ([#642](https://github.com/s977043/river-reviewer/issues/642)) ([495a76b](https://github.com/s977043/river-reviewer/commit/495a76b4e073fa72199959333aa348bdaa6be134))

## [0.17.1](https://github.com/s977043/river-reviewer/compare/v0.17.0...v0.17.1) (2026-04-25)


### Bug Fixes

* **lychee:** exclude GitHub compare URLs from link checking ([#640](https://github.com/s977043/river-reviewer/issues/640)) ([ec88a6a](https://github.com/s977043/river-reviewer/commit/ec88a6ae153ccb87fe17b530c8cdf2bba6ec712e))

## [0.17.0](https://github.com/s977043/river-reviewer/compare/v0.16.0...v0.17.0) (2026-04-25)


### Features

* **eval:** add Re-review / Regression Review with finding fingerprints ([#621](https://github.com/s977043/river-reviewer/issues/621)) ([#634](https://github.com/s977043/river-reviewer/issues/634)) ([515f51d](https://github.com/s977043/river-reviewer/commit/515f51d40f4528650301055080fe419a0ab8c2f3))
* **eval:** add Review Result Store and Dashboard ([#620](https://github.com/s977043/river-reviewer/issues/620)) ([#635](https://github.com/s977043/river-reviewer/issues/635)) ([6abd0ae](https://github.com/s977043/river-reviewer/commit/6abd0aeeb5239079609da89eeb8db9f61cf0fe9f))
* **review:** add parallel Reviewer Orchestration layer ([#622](https://github.com/s977043/river-reviewer/issues/622)) ([#633](https://github.com/s977043/river-reviewer/issues/633)) ([a7cdd33](https://github.com/s977043/river-reviewer/commit/a7cdd33a927e98dfc0f47f3da5b312a61881015c))


### Bug Fixes

* **finding-classifier:** apply ruleId=unknown guard to deduplicateWithinFile ([#631](https://github.com/s977043/river-reviewer/issues/631)) ([06ea25e](https://github.com/s977043/river-reviewer/commit/06ea25eaa0eb47405568a81a4c652b6a8532f374))

## [0.16.0](https://github.com/s977043/river-reviewer/compare/v0.15.0...v0.16.0) (2026-04-25)


### Features

* **finding-classifier:** add noise control layer with classify pipeline ([#617](https://github.com/s977043/river-reviewer/issues/617)) ([f7fc882](https://github.com/s977043/river-reviewer/commit/f7fc882e963e6b164d9e7a3d25b3f84e27dea997))
* **review:** add review depth control based on PR size ([#619](https://github.com/s977043/river-reviewer/issues/619)) ([9129998](https://github.com/s977043/river-reviewer/commit/9129998663dd16b7608ef994f370ec54f483d597))
* **scoring:** add finding score breakdown ([#618](https://github.com/s977043/river-reviewer/issues/618)) ([1d67c56](https://github.com/s977043/river-reviewer/commit/1d67c56b24ef5cd0181265efa56f40a0c4727249))

## [0.15.0](https://github.com/s977043/river-reviewer/compare/v0.14.2...v0.15.0) (2026-04-23)


### Features

* **review:** introduce Finding Pipeline with structured findings ([#624](https://github.com/s977043/river-reviewer/issues/624)) ([dc8a17c](https://github.com/s977043/river-reviewer/commit/dc8a17c89b3c5b5147700dc13223517efeae5e92))

## [0.14.2](https://github.com/s977043/river-reviewer/compare/v0.14.1...v0.14.2) (2026-04-23)


### Bug Fixes

* **codex:** replace invalid approval_policy `full-auto` with `on-request` ([#609](https://github.com/s977043/river-reviewer/issues/609)) ([26af19b](https://github.com/s977043/river-reviewer/commit/26af19b3505bab903244809a10a5d61ff94ba6bc))
* **docs:** bump action tag references to v0.14.1 ([#610](https://github.com/s977043/river-reviewer/issues/610)) ([9d2cfaa](https://github.com/s977043/river-reviewer/commit/9d2cfaa9c55e065a6031dc3b9e929b064ccb9274))
* **docs:** correct CHANGELOG compare URL for v0.14.0 ([#614](https://github.com/s977043/river-reviewer/issues/614)) ([7abfec9](https://github.com/s977043/river-reviewer/commit/7abfec910401c43ccabc711d93e12705b84aa62f))

## [0.14.1](https://github.com/s977043/river-reviewer/compare/v0.14.0...v0.14.1) (2026-04-18)


### Bug Fixes

* **release-please:** emit plain tag format and guard alias generation ([#597](https://github.com/s977043/river-reviewer/issues/597)) ([#598](https://github.com/s977043/river-reviewer/issues/598)) ([2de682a](https://github.com/s977043/river-reviewer/commit/2de682ad13a5dc6d7054e392a2444cbb93983d07))

## [0.14.0](https://github.com/s977043/river-reviewer/compare/v0.13.1...v0.14.0) (2026-04-18)


### Features

* **action:** bundle GitHub Action with ncc to eliminate cold start ([1702ba2](https://github.com/s977043/river-reviewer/commit/1702ba229f5f6dbbce9bb305d40e6e64501e2459))
* **action:** bundle GitHub Action with ncc to eliminate cold start ([#394](https://github.com/s977043/river-reviewer/issues/394)) ([20c68fe](https://github.com/s977043/river-reviewer/commit/20c68fe79b7b4193902068d198dafc29e80fbe2e))
* add availability and communication skills ([62c65c9](https://github.com/s977043/river-reviewer/commit/62c65c94fa0e83ec873a2c6983c1a15048b2930f))
* add availability and communication skills ([674decf](https://github.com/s977043/river-reviewer/commit/674decfe0e3b104061e2de8f3989f5caafd23b7e))
* add availability and communication skills ([652a768](https://github.com/s977043/river-reviewer/commit/652a7681a53eb1217af9ba6797cf22edfbb86bbd))
* add Claude Code best practices (hooks, commands, enhanced CLAUDE.md) ([85c7b56](https://github.com/s977043/river-reviewer/commit/85c7b5689cb2abf0ba70f480df2fc6ce75d1a16f))
* add Claude Code best practices (hooks, commands, enhanced CLAUDE.md) ([#290](https://github.com/s977043/river-reviewer/issues/290)) ([feb3879](https://github.com/s977043/river-reviewer/commit/feb3879d6496fe5dec8b89c99d105b43a7ed7451))
* add comprehensive link checking system ([#255](https://github.com/s977043/river-reviewer/issues/255)) ([25c1a15](https://github.com/s977043/river-reviewer/commit/25c1a1541e1f0d1aab3bdae4f591696c60011c26))
* add comprehensive link checking system with security validation ([#256](https://github.com/s977043/river-reviewer/issues/256)) ([718e3ff](https://github.com/s977043/river-reviewer/commit/718e3ff32c3d662615f5cf7331096fa416dc88bf))
* add config file review skill and improve fallback messages ([102dab0](https://github.com/s977043/river-reviewer/commit/102dab03da191b8157d37a8323ea9b953f44f031))
* add configurable review config loader ([c3a307c](https://github.com/s977043/river-reviewer/commit/c3a307cddf869a0717c47dabdd1b5bac4406bd43))
* add Copilot instructions and agents to integrate with skills ([3c6642b](https://github.com/s977043/river-reviewer/commit/3c6642b46baddc536728b1b4fbae5a6544af073e))
* add Copilot instructions and agents to integrate with skills ([3c1d6c6](https://github.com/s977043/river-reviewer/commit/3c1d6c6560525cb8b0ea6cfed9f0ba88df25c0fb))
* add create-skill scaffolding tool ([#229](https://github.com/s977043/river-reviewer/issues/229)) ([#236](https://github.com/s977043/river-reviewer/issues/236)) ([6e7981c](https://github.com/s977043/river-reviewer/commit/6e7981c8fe412693545cd24fd5cf6913d5198c35))
* add GitHub Actions security heuristics ([#253](https://github.com/s977043/river-reviewer/issues/253)) ([4d96072](https://github.com/s977043/river-reviewer/commit/4d9607297aa86774a4bd7874f931a5f2fc3992dc))
* add skill-eval CI workflow and migrate logging-observability skill ([#259](https://github.com/s977043/river-reviewer/issues/259)) ([f4ea416](https://github.com/s977043/river-reviewer/commit/f4ea4163947b35a3d62ca894b37d144eb5fd24b7))
* add skill.yaml specification and template ([#226](https://github.com/s977043/river-reviewer/issues/226)) ([#234](https://github.com/s977043/river-reviewer/issues/234)) ([2a3ce1f](https://github.com/s977043/river-reviewer/commit/2a3ce1fd494768d636feec19818902f53bc6d64e))
* add skills README and registry ([#230](https://github.com/s977043/river-reviewer/issues/230)) ([#237](https://github.com/s977043/river-reviewer/issues/237)) ([7f8de2e](https://github.com/s977043/river-reviewer/commit/7f8de2e53fc6190d1328e64aec078dd4c1964056))
* add stability labels and meta-consistency CI check ([fd0775c](https://github.com/s977043/river-reviewer/commit/fd0775cfc5356350fa47715c0d4a0a7e03aa3fb1))
* add upstream api versioning compatibility skill ([372b896](https://github.com/s977043/river-reviewer/commit/372b896d68886a610d0b33acb254ee1b02a7b47b))
* add upstream api versioning compatibility skill ([ebb6171](https://github.com/s977043/river-reviewer/commit/ebb61712915e309d4bbe22da6904b30777799795))
* add upstream dr multiregion skill ([5f3487f](https://github.com/s977043/river-reviewer/commit/5f3487f6c0fa4d51420c28f2ccaa44a9d67c6f0c))
* add upstream dr multiregion skill ([61afd60](https://github.com/s977043/river-reviewer/commit/61afd609766d2aba4fd65aff471bbea0035495b1))
* add Zod schema and validation for skill.yaml ([#227](https://github.com/s977043/river-reviewer/issues/227)) ([#235](https://github.com/s977043/river-reviewer/issues/235)) ([39955b4](https://github.com/s977043/river-reviewer/commit/39955b49b19a2a3ec8375ad6d11bab2225dca915))
* **agent-skills:** add 5 routing agent skills for river-reviewer ([d17728f](https://github.com/s977043/river-reviewer/commit/d17728f7ebdc8c8b128b53684b5e3e780379b4be))
* **agent-skills:** add 5 routing agent skills for river-reviewer ([da7e7fe](https://github.com/s977043/river-reviewer/commit/da7e7feac42e0779fdf31b49b2eb11ee4f7876fd))
* **ci:** add meta-consistency validation script and CI job ([#398](https://github.com/s977043/river-reviewer/issues/398)) ([a89b905](https://github.com/s977043/river-reviewer/commit/a89b905e094a726855af8b46a4cd5858f2350eac))
* **ci:** add nightly eval workflow for review quality monitoring ([#458](https://github.com/s977043/river-reviewer/issues/458)) ([daa0833](https://github.com/s977043/river-reviewer/commit/daa0833d8515307ef49d0a51ddfd4ebff59db5bb))
* **ci:** add PlanGate PR review workflow (closes [#521](https://github.com/s977043/river-reviewer/issues/521)) ([#572](https://github.com/s977043/river-reviewer/issues/572)) ([d6b5405](https://github.com/s977043/river-reviewer/commit/d6b540566d7499dcd98c47cab275e976366cfc0b))
* **ci:** add weekly GC workflow for deterministic maintenance checks ([#570](https://github.com/s977043/river-reviewer/issues/570)) ([a01992f](https://github.com/s977043/river-reviewer/commit/a01992f583da029e9c30be6931c1db02191acc94)), closes [#522](https://github.com/s977043/river-reviewer/issues/522)
* **ci:** introduce setup-node-deps composite action and apply CI best practices ([#528](https://github.com/s977043/river-reviewer/issues/528)) ([39fe95f](https://github.com/s977043/river-reviewer/commit/39fe95f252fcb5e8f2d37ec688f648848b4bd7ed))
* **commands:** add /preflight to verify task state before multi-PR work ([#501](https://github.com/s977043/river-reviewer/issues/501)) ([6268549](https://github.com/s977043/river-reviewer/commit/62685491e47387977cd430d6edf22eced8e787a2))
* **dry-run:** ヒューリスティック対応スキルのみ dry-run で実行 ([3f23b9b](https://github.com/s977043/river-reviewer/commit/3f23b9b9fc191dce312e83adf977055366c3943d))
* **eval:** add eval ledger section to PR template ([#454](https://github.com/s977043/river-reviewer/issues/454)) ([5e0ba5c](https://github.com/s977043/river-reviewer/commit/5e0ba5c3cc11cb15857063f7221adcab64d28a03)), closes [#438](https://github.com/s977043/river-reviewer/issues/438)
* **eval:** add failure taxonomy and categorized fixture reports ([#419](https://github.com/s977043/river-reviewer/issues/419)) ([707a8ec](https://github.com/s977043/river-reviewer/commit/707a8ec60197d0dd32aadd60ffb283e974cc6688))
* **eval:** add unified evaluation runner and experiment ledger ([#413](https://github.com/s977043/river-reviewer/issues/413)) ([980e0bc](https://github.com/s977043/river-reviewer/commit/980e0bc9f7650e26d7204cfa66091f9885ddf080))
* **evals:** add nightly measure and audit pipeline ([#433](https://github.com/s977043/river-reviewer/issues/433)) ([1c802fc](https://github.com/s977043/river-reviewer/commit/1c802fca42effc2b4ff66a613999cce20ef098e0))
* **evals:** add risk-map and memory-fallback regression eval fixtures ([#469](https://github.com/s977043/river-reviewer/issues/469)) ([3ddc973](https://github.com/s977043/river-reviewer/commit/3ddc973343fdeef3c9f8005d1531f7fa81554443)), closes [#435](https://github.com/s977043/river-reviewer/issues/435)
* **eval:** structured fixture results and multi-axis metrics ([#417](https://github.com/s977043/river-reviewer/issues/417)) ([f261995](https://github.com/s977043/river-reviewer/commit/f261995ad9a9a0130483b1ce7a8c4cfb65e37a67))
* expand permission settings based on actual usage patterns ([791b868](https://github.com/s977043/river-reviewer/commit/791b8688517c2eb30bd9fc5e72876e8a748ea467))
* expand upstream architecture review skills ([9e484bb](https://github.com/s977043/river-reviewer/commit/9e484bbb70d6b921d8cf4ed6b09059598e32252e))
* expand upstream architecture review skills ([a6bf571](https://github.com/s977043/river-reviewer/commit/a6bf571bd72969b37d38727bf41eafcdc0568f38))
* implement Skill-based Architecture ([#205](https://github.com/s977043/river-reviewer/issues/205)) ([ff82ba0](https://github.com/s977043/river-reviewer/commit/ff82ba03705685f48acfd69d2947eca71a618f28))
* **memory:** add GitHub Artifact persistence for Riverbed Memory ([#425](https://github.com/s977043/river-reviewer/issues/425)) ([b85fecf](https://github.com/s977043/river-reviewer/commit/b85fecf18dbe46c9f72573e3348a3d0ff159fadc))
* **memory:** add memory-context bridge for pipeline integration ([#432](https://github.com/s977043/river-reviewer/issues/432)) ([e1aee7e](https://github.com/s977043/river-reviewer/commit/e1aee7e76cfaf7eb5ff590a92eedbaa97de390ae))
* **memory:** add Riverbed Memory v1 runtime ([#426](https://github.com/s977043/river-reviewer/issues/426)) ([4e94434](https://github.com/s977043/river-reviewer/commit/4e94434e9fc6edaf94033339d70e0508cc5369b1))
* **output:** add YAML output format with scoring and verdict ([#596](https://github.com/s977043/river-reviewer/issues/596)) ([d613e68](https://github.com/s977043/river-reviewer/commit/d613e681a1a3e39ce3315bc51b3022a9336a35d8))
* **output:** スキル単位で指摘をグループ化 ([7de916f](https://github.com/s977043/river-reviewer/commit/7de916feb3ef1fc602a2a0090bf7d3a3695ed7aa))
* **output:** スキル単位で指摘をグループ化 ([560493c](https://github.com/s977043/river-reviewer/commit/560493c22eec689deb2b37117d711c3ac5868b7e))
* **policy:** add risk map and escalation policy ([#462](https://github.com/s977043/river-reviewer/issues/462)) ([9c560de](https://github.com/s977043/river-reviewer/commit/9c560de80cf3b3a5329c839554a78d792e81c554))
* **policy:** add suppression and resurfacing mechanism ([#434](https://github.com/s977043/river-reviewer/issues/434)) ([4b6029b](https://github.com/s977043/river-reviewer/commit/4b6029b5b9c32d5b048cb8415c3bc38986852a3e))
* progressive disclosure を明示的なスキルローディング原則として導入 ([#459](https://github.com/s977043/river-reviewer/issues/459)) ([37fcb37](https://github.com/s977043/river-reviewer/commit/37fcb374ce8a1e8fab5f5803ab10f08f69f770af))
* **release-please:** auto-sync README version via extra-files ([#592](https://github.com/s977043/river-reviewer/issues/592)) ([#593](https://github.com/s977043/river-reviewer/issues/593)) ([6503ce8](https://github.com/s977043/river-reviewer/commit/6503ce8177b8cea4be7dbe90eb2dc1a31b1ace1f))
* **review:** add ADR/spec linker and dependency impact analyzer ([#423](https://github.com/s977043/river-reviewer/issues/423)) ([0873e05](https://github.com/s977043/river-reviewer/commit/0873e05100f2b8c81270e115110eb681f9c20537))
* **review:** add changed-files classifier ([#420](https://github.com/s977043/river-reviewer/issues/420)) ([9ba8b06](https://github.com/s977043/river-reviewer/commit/9ba8b064563a1b81227d9790cfb69c7b74af8f95))
* **review:** add rule-based finding verifier ([#418](https://github.com/s977043/river-reviewer/issues/418)) ([9cfc28e](https://github.com/s977043/river-reviewer/commit/9cfc28e9550f833286688b24c4566020127d568f))
* **review:** add test impact analyzer and config risk detector ([#422](https://github.com/s977043/river-reviewer/issues/422)) ([f74645b](https://github.com/s977043/river-reviewer/commit/f74645b7981e7edd9798ba4e9d52d3e1e43205ad))
* **review:** integrate adr-linker into review pipeline ([#456](https://github.com/s977043/river-reviewer/issues/456)) ([1a35681](https://github.com/s977043/river-reviewer/commit/1a35681092a26bffed0bb359b91707943a100034))
* **review:** integrate file-classifier into execution plan ([#427](https://github.com/s977043/river-reviewer/issues/427)) ([3544e4e](https://github.com/s977043/river-reviewer/commit/3544e4e74c42e8705ad3f51d8253790b567bc73b))
* **review:** integrate file-classifier into verifier with debug output ([#457](https://github.com/s977043/river-reviewer/issues/457)) ([e1d3f42](https://github.com/s977043/river-reviewer/commit/e1d3f427e3c51a6d55e8ddb4171e6d516f31252f))
* **review:** integrate verifier into review pipeline ([#430](https://github.com/s977043/river-reviewer/issues/430)) ([4d84bdc](https://github.com/s977043/river-reviewer/commit/4d84bdc01b94aa6b6ab2a71eefb66073b0c55806))
* Riverbed Memory v1 ライフサイクルと置換モデルを実装 ([#474](https://github.com/s977043/river-reviewer/issues/474)) ([f222087](https://github.com/s977043/river-reviewer/commit/f222087ac54f8243dd517045923bf89d56270aff))
* **runner:** enable runtime loading of agent-skills ([658c39e](https://github.com/s977043/river-reviewer/commit/658c39e9def36f7827e744aa6f13394162ae4ffd))
* **runner:** enable runtime loading of agent-skills and update audit script ([01fc8a2](https://github.com/s977043/river-reviewer/commit/01fc8a20f9f7decf83fe3cff951ec22189f4e3b5))
* **schema:** add review-audit to outputKind enum (closes [#585](https://github.com/s977043/river-reviewer/issues/585)) ([#587](https://github.com/s977043/river-reviewer/issues/587)) ([1559408](https://github.com/s977043/river-reviewer/commit/155940864e40d92b5ae7b7e7c949881ce994c6a9))
* **scripts:** add review severity gate evaluator ([#401](https://github.com/s977043/river-reviewer/issues/401)) ([667094a](https://github.com/s977043/river-reviewer/commit/667094a42c761b4dd955f08ad3fca2d01882962f))
* **skill:** add PlanGate evals fixtures (closes [#523](https://github.com/s977043/river-reviewer/issues/523)) ([#574](https://github.com/s977043/river-reviewer/issues/574)) ([ef3f386](https://github.com/s977043/river-reviewer/commit/ef3f386d884fb0fa065fc231ae56f166f662f144))
* **skill:** add plangate-exec-conformance spec ([#561](https://github.com/s977043/river-reviewer/issues/561)) ([de20ba1](https://github.com/s977043/river-reviewer/commit/de20ba121e298a6638e250df0f965a25c8c8df97)), closes [#520](https://github.com/s977043/river-reviewer/issues/520)
* **skill:** add plangate-plan-integrity spec ([#560](https://github.com/s977043/river-reviewer/issues/560)) ([448ecb9](https://github.com/s977043/river-reviewer/commit/448ecb9ef70edad67bfe85c7b425bc0ad3cda69d))
* **skills:** add adversarial review skills (Pre-mortem, War Game, Logic Torturing) ([#372](https://github.com/s977043/river-reviewer/issues/372)) ([baa3bc6](https://github.com/s977043/river-reviewer/commit/baa3bc6127f272302b7d24d924a45b5d70ea00dc))
* **skills:** add Agent Skills (SKILL.md) import/export bridge ([#349](https://github.com/s977043/river-reviewer/issues/349)) ([305f14c](https://github.com/s977043/river-reviewer/commit/305f14c4b610b90e8ff45afd88fdb1d516c7584a))
* **skills:** add architecture-validation-plan skill ([#260](https://github.com/s977043/river-reviewer/issues/260)) ([b959c56](https://github.com/s977043/river-reviewer/commit/b959c56d60207e5b0e24ebe663b6eb4d6999dca9))
* **skills:** add cache-strategy-consistency skill ([#262](https://github.com/s977043/river-reviewer/issues/262)) ([99b336c](https://github.com/s977043/river-reviewer/commit/99b336c13e4310c179ada9b35bdcf143ccc71fc0))
* **skills:** add Claude Code skill management skills ([#380](https://github.com/s977043/river-reviewer/issues/380)) ([8fae238](https://github.com/s977043/river-reviewer/commit/8fae238e8bc3f9b626361ca3ee11366619bffac8))
* **skills:** add entry skill river-reviewer ([bacaef1](https://github.com/s977043/river-reviewer/commit/bacaef1b3ace05911fa2ce7f26c8304d4b9a07ed))
* **skills:** add entry skill river-reviewer ([ece1790](https://github.com/s977043/river-reviewer/commit/ece1790371a44ba1b6d6245e1d80475ab8fe2b72)), closes [#313](https://github.com/s977043/river-reviewer/issues/313)
* **skills:** add Inversion+Pipeline pattern to all skills ([#399](https://github.com/s977043/river-reviewer/issues/399)) ([e0ec61b](https://github.com/s977043/river-reviewer/commit/e0ec61b463f90f07ad0f2a5b7752200ad16fca82))
* **skills:** add multitenancy-isolation skill ([#261](https://github.com/s977043/river-reviewer/issues/261)) ([685280b](https://github.com/s977043/river-reviewer/commit/685280b41fff3671f8cb6dd8f0b83db6db6fbeef))
* **skills:** add security-privacy-design skill ([#264](https://github.com/s977043/river-reviewer/issues/264)) ([e9edfef](https://github.com/s977043/river-reviewer/commit/e9edfefd5dd2441985c7899fdc7a15410921691a))
* **skills:** add SKILL.md and references templates ([c7492d3](https://github.com/s977043/river-reviewer/commit/c7492d3afecc5821f8a1a57d88234b5c6ff83b59))
* **skills:** add SKILL.md and references templates ([dcb550a](https://github.com/s977043/river-reviewer/commit/dcb550a979112c191008bc4234417c21405b6a47)), closes [#311](https://github.com/s977043/river-reviewer/issues/311)
* **skills:** add skills audit script and report ([595be07](https://github.com/s977043/river-reviewer/commit/595be07911411ddab003fea6dc9439fc96cb7e38))
* **skills:** add skills audit script and report ([7ac29b4](https://github.com/s977043/river-reviewer/commit/7ac29b4975059ab63c1e323e8bd21bd955eab3db)), closes [#309](https://github.com/s977043/river-reviewer/issues/309)
* **skills:** add test scaffolding skills for Laravel, Next.js, React, Remix, and Vue.js ([6a10d80](https://github.com/s977043/river-reviewer/commit/6a10d8035c3d13a61537f49b0c0f25ed01eeb880))
* **skills:** add test scaffolding skills for Laravel, Next.js, React, Remix, and Vue.js ([956ae40](https://github.com/s977043/river-reviewer/commit/956ae40d194e330d98296209be055c6f41ac95cd))
* **skills:** Agent Skills (SKILL.md) bridge with review enhancements ([#350](https://github.com/s977043/river-reviewer/issues/350)) ([93c4ba5](https://github.com/s977043/river-reviewer/commit/93c4ba58ec46869ce342e0659afed178a9c5a3c1))
* **skills:** スキル管理スキルに5パターン設計システムを導入 ([#382](https://github.com/s977043/river-reviewer/issues/382)) ([9fa274a](https://github.com/s977043/river-reviewer/commit/9fa274a2efbe724380c3f6c5279292576d4bfe4d))
* support skill.yaml directory structure in skill loader ([#239](https://github.com/s977043/river-reviewer/issues/239)) ([8041f07](https://github.com/s977043/river-reviewer/commit/8041f07fe2d9ae111b5f132e147ff67ec44615ca))
* support skipping by PR labels and document config ([d350072](https://github.com/s977043/river-reviewer/commit/d3500728b5c259ead121a686783770a2d3dc7377))
* レビュー基盤改善と敵対的レビュースキルの追加 ([#371](https://github.com/s977043/river-reviewer/issues/371)) ([a4595b2](https://github.com/s977043/river-reviewer/commit/a4595b2e2267cc27c700da365daa863e5bb4efbb))
* 型駆動設計ガードとレビュー自動化境界ガードを追加 ([#352](https://github.com/s977043/river-reviewer/issues/352)) ([3616261](https://github.com/s977043/river-reviewer/commit/3616261bf59d47bb048851b7856fb4c5ae3e145a))
* 構造化レビューアーティファクトスキーマを追加 ([#460](https://github.com/s977043/river-reviewer/issues/460)) ([0cf1e2f](https://github.com/s977043/river-reviewer/commit/0cf1e2f13ecba2fcb89cbf80f58053d8803f0d2c))
* 評価を多次元レビュールーブリックに拡張 ([#470](https://github.com/s977043/river-reviewer/issues/470)) ([fc6bba6](https://github.com/s977043/river-reviewer/commit/fc6bba678e3f168bea51736a83f7793d65b62b83))


### Bug Fixes

* address additional review comments ([22800e1](https://github.com/s977043/river-reviewer/commit/22800e192b94673ab0435aebcba3cbd6c219be68))
* address CI lint errors (MD012, MD004) and review feedback (security, robustness) ([7c52477](https://github.com/s977043/river-reviewer/commit/7c5247762b20bb4b941c884c4416e246f6c274ca))
* address Copilot review comments for scheduled validation workflows ([4d04932](https://github.com/s977043/river-reviewer/commit/4d04932be4ba2b7b18c43d4255c510be0e5da19e))
* address PR [#237](https://github.com/s977043/river-reviewer/issues/237) review feedback ([#238](https://github.com/s977043/river-reviewer/issues/238)) ([a7581a8](https://github.com/s977043/river-reviewer/commit/a7581a85081590ecb72c94cb4e625193ea661a92))
* address review comments (formatting, portability, command accuracy) ([28fa267](https://github.com/s977043/river-reviewer/commit/28fa267e8bfaccd3b3a3bec17d4d2f6a7e46980d))
* address review comments on AGENTS.md ([f21474c](https://github.com/s977043/river-reviewer/commit/f21474cc0a9f33b93b5088fb9c25fb1f855bde7b))
* address review comments on PR [#201](https://github.com/s977043/river-reviewer/issues/201) ([1460117](https://github.com/s977043/river-reviewer/commit/14601176aa914c0cf369b1f8becb44a769231a4d))
* address review comments on templates ([1e3159e](https://github.com/s977043/river-reviewer/commit/1e3159e12f169c15158c54f59e7c78063bbde337))
* **agent-skills:** add missing References section to 4 routing agent skills ([c3f5a51](https://github.com/s977043/river-reviewer/commit/c3f5a51dec1b1cdb0efd751c9ba5f1b480f0c2de))
* **agent-skills:** address PR [#378](https://github.com/s977043/river-reviewer/issues/378) review comments on routing skills ([72ab2e5](https://github.com/s977043/river-reviewer/commit/72ab2e566d991179e2b96ff8a5ad121e6bc6169a))
* **agent-skills:** address PR review comments on routing skills ([2d2c1ff](https://github.com/s977043/river-reviewer/commit/2d2c1ffb480107b3f292eab88f05ba9a13543508))
* **agent-skills:** fix remaining short-form skill ID in testing ROUTING.md ([d2be57d](https://github.com/s977043/river-reviewer/commit/d2be57d259b7af9269a544923f1061dbec1907d1))
* **agent-skills:** fix severity validation and exclude routing skills from planner ([bc2a55c](https://github.com/s977043/river-reviewer/commit/bc2a55cc52b3d346c7d95ed1afce80fe2d2178d2))
* agents.md dead link and root allowlist cleanup ([#360](https://github.com/s977043/river-reviewer/issues/360)) ([47df063](https://github.com/s977043/river-reviewer/commit/47df063a9ccbf93a65b055016aa6b745aefed5c7))
* apply prettier formatting to check.md ([3496334](https://github.com/s977043/river-reviewer/commit/34963343301cd26309fb9de56405ba0b70a63731))
* apply review feedback - remove redundant code and add comprehensive tests ([d9f39cc](https://github.com/s977043/river-reviewer/commit/d9f39ccc28555f3bb806499de56e2716b6841402))
* avoid merging arrays and objects in config merge ([18eb1ec](https://github.com/s977043/river-reviewer/commit/18eb1ec8c1aeb6634e9cd4a57c48cbd5384d2ebf))
* **ci:** grant id-token: write to unit-tests for codecov OIDC ([#546](https://github.com/s977043/river-reviewer/issues/546)) ([81127bc](https://github.com/s977043/river-reviewer/commit/81127bc14fd25f36804f82aef404f1ddaeb2deb0)), closes [#545](https://github.com/s977043/river-reviewer/issues/545)
* **ci:** ignore CHANGELOG.md in lint ([697417b](https://github.com/s977043/river-reviewer/commit/697417bc66a8d4c2fefda90bf235bf31316b2b19))
* **ci:** update .lychee.toml for latest lychee parser compatibility ([#368](https://github.com/s977043/river-reviewer/issues/368)) ([2d3da5a](https://github.com/s977043/river-reviewer/commit/2d3da5a400fb268e6e0492f1a6c16424a3cb7484))
* **cli:** add --output json mode for severity gate integration ([885084f](https://github.com/s977043/river-reviewer/commit/885084fe4e567a6c02c8a721543a9da04a06eba1))
* **cli:** redirect run header to stderr in json output mode ([fd3c56e](https://github.com/s977043/river-reviewer/commit/fd3c56e9ef202b9e6f9414ee436501410fec7ae8))
* **codex:** address PR review feedback ([b31d901](https://github.com/s977043/river-reviewer/commit/b31d901872ed86b211281d67173e25bdc713cbb5))
* **docs:** bump action tag references to v0.13.0 ([#590](https://github.com/s977043/river-reviewer/issues/590)) ([adf3b7d](https://github.com/s977043/river-reviewer/commit/adf3b7d8c575769b0c89808a96a56143b845c4f9))
* **docs:** clarify that review pipeline is OpenAI-only ([#490](https://github.com/s977043/river-reviewer/issues/490)) ([5fed8c1](https://github.com/s977043/river-reviewer/commit/5fed8c1da37e7c51e9eb47b0b31222bb13e4788c))
* **docs:** correct npm script name eval:skills → eval:fixtures ([4e29419](https://github.com/s977043/river-reviewer/commit/4e29419480312c5c8b039c045c58355bb252ed77))
* **docs:** deduplicate AGENT_LEARNINGS.md and fix broken GEMINI.md reference ([#414](https://github.com/s977043/river-reviewer/issues/414)) ([1194672](https://github.com/s977043/river-reviewer/commit/1194672df27f0bcd3e54ec384e0902676221a0e7))
* **docs:** update project link to repository Projects page to resolve lychee 404 ([#198](https://github.com/s977043/river-reviewer/issues/198)) ([#203](https://github.com/s977043/river-reviewer/issues/203)) ([b9db673](https://github.com/s977043/river-reviewer/commit/b9db673fcd394912372a7bc7fe2fcdb65b66d22a))
* enforce branch policy in agent configuration ([#353](https://github.com/s977043/river-reviewer/issues/353)) ([f54bb6f](https://github.com/s977043/river-reviewer/commit/f54bb6fd1a168c297c08f0f727c6dbfbcf4a5498))
* **eval:** rubric schema scope, direction field, terminology, integrity tests ([#547](https://github.com/s977043/river-reviewer/issues/547)) ([f869ecb](https://github.com/s977043/river-reviewer/commit/f869ecb05e164476f7c683a9689f981edde0daa4)), closes [#481](https://github.com/s977043/river-reviewer/issues/481)
* **evals:** prevent stderr leak and silent failure in nightly-audit ([#472](https://github.com/s977043/river-reviewer/issues/472)) ([#473](https://github.com/s977043/river-reviewer/issues/473)) ([8ba8d8c](https://github.com/s977043/river-reviewer/commit/8ba8d8c9925bde340a704c28e19dc2a8ac4b8754))
* format CHANGELOG.md to pass prettier checks ([889123d](https://github.com/s977043/river-reviewer/commit/889123d04211ab0c2e299abfb01bcaeb693bb29b))
* Git diffのmaxBufferを拡大 ([6088f62](https://github.com/s977043/river-reviewer/commit/6088f62086581f1d859de16e9ae26eb3fbd0d98f))
* Git diffのmaxBufferを拡大 ([f36af63](https://github.com/s977043/river-reviewer/commit/f36af63c6580eb0a376842c0825f3d14f66c1010))
* harden config loader validation ([244fa53](https://github.com/s977043/river-reviewer/commit/244fa53486626553d1c99ca65553377f1b2b9f16))
* improve markdown output format for review findings ([91d09c3](https://github.com/s977043/river-reviewer/commit/91d09c3c21f16261d99ca023b613a2aca5f8bf7a))
* improve markdown output format for review findings ([78f0847](https://github.com/s977043/river-reviewer/commit/78f08471d8d536f378e04cb6cebc7e1fd9894f57))
* increase maxBuffer for large diffs ([db81630](https://github.com/s977043/river-reviewer/commit/db81630bd19b830e49a8fe152de562b51872959a))
* keep vercel root at / ([#213](https://github.com/s977043/river-reviewer/issues/213)) ([19970c0](https://github.com/s977043/river-reviewer/commit/19970c03d057b0cea049acfa88acd19dd9b2e0d8))
* **lint:** add language to fenced code blocks ([3bcaa21](https://github.com/s977043/river-reviewer/commit/3bcaa212b137416b728b3ab685d1fc3ece6ddcbb))
* Markdown インジェクション対策と出力順序の安定化 ([39d0fff](https://github.com/s977043/river-reviewer/commit/39d0fff91d5cadb8f2d49f54ed09e17ce919cecf))
* **meta:** update version refs to v0.10.0 and unify canonical URL ([8bb4dde](https://github.com/s977043/river-reviewer/commit/8bb4dde97b27c06e147f07d1b85b661c7b6e7b8f))
* **meta:** update version refs to v0.10.0 and unify canonical URL ([#391](https://github.com/s977043/river-reviewer/issues/391), [#392](https://github.com/s977043/river-reviewer/issues/392)) ([8bc2a5d](https://github.com/s977043/river-reviewer/commit/8bc2a5dfa17dc22f01bc69b0b7c0bba2c7e67e4d))
* **readme:** correct license table to match actual LICENSE file (MIT) ([5a06394](https://github.com/s977043/river-reviewer/commit/5a06394d1bfe4e2e442f6b8d6dda55496af33a63))
* regenerate corrupted package-lock.json to fix CI failures ([056fd93](https://github.com/s977043/river-reviewer/commit/056fd93e65533363f5f6341a1002350af0add10f))
* remove all merge conflict markers from create-skill.mjs ([3bfba20](https://github.com/s977043/river-reviewer/commit/3bfba20c823663b19483ae2adf700082b4b0311f))
* remove merge conflict markers from create-skill.mjs ([913c117](https://github.com/s977043/river-reviewer/commit/913c1177853f6259ab9e0acca6fd00f1b632d8c8))
* remove trim() to preserve leading newline in markdown output ([b1b0abe](https://github.com/s977043/river-reviewer/commit/b1b0abeb0e066fadc332484587aeaa0f3af7e01c))
* resolve Docusaurus duplicate ID error and address review feedback ([c2087ef](https://github.com/s977043/river-reviewer/commit/c2087ef2e609a5ba650c91c8e8e9f45518f4489a))
* resolve prettier formatting issues in CHANGELOG.md ([a947478](https://github.com/s977043/river-reviewer/commit/a947478da9f8ad1397acbd75f2df8c4c22070391))
* restore table formatting in docs/agent-layers.md ([e405ae4](https://github.com/s977043/river-reviewer/commit/e405ae44a3385bc50e3f4f803f6287ace7725e59))
* **review:** align silent-catch heuristic severity with skill severity ([#494](https://github.com/s977043/river-reviewer/issues/494)) ([dfbae3b](https://github.com/s977043/river-reviewer/commit/dfbae3b0b467c3575f2a4ae928976af497c7fae4))
* **schema:** align riverbed-index schema with v1 inline-entries impl (closes [#565](https://github.com/s977043/river-reviewer/issues/565)) ([#566](https://github.com/s977043/river-reviewer/issues/566)) ([432ea5f](https://github.com/s977043/river-reviewer/commit/432ea5f035b8a90dae099ad26d13f54e6097472b))
* **schemas:** tighten review-artifact schema and add ajv validation tests ([#548](https://github.com/s977043/river-reviewer/issues/548)) ([f2b08da](https://github.com/s977043/river-reviewer/commit/f2b08dab7ec9d2521248255531238c640494ba7e))
* **scripts:** add .catch() handler and expand check scope in meta-consistency ([54823f3](https://github.com/s977043/river-reviewer/commit/54823f37a8bc62c52680c747e5ecdd74fb173d1f))
* **scripts:** respect --check flag and skip markdown table rows ([#504](https://github.com/s977043/river-reviewer/issues/504)) ([5583f80](https://github.com/s977043/river-reviewer/commit/5583f80febeca1bf58f751ed24d5546e872a87c9))
* **scripts:** skip agent-skills in legacy validator ([18cac4f](https://github.com/s977043/river-reviewer/commit/18cac4fd82ee5db59ad9c11292e8a02f587df4c6))
* **security:** address PR [#350](https://github.com/s977043/river-reviewer/issues/350) review findings for agent skill bridge ([#361](https://github.com/s977043/river-reviewer/issues/361)) ([eb4e7a4](https://github.com/s977043/river-reviewer/commit/eb4e7a4fd3dd4d12e430d97a15eb745152d2cca1))
* **skills:** 5パターン診断に基づくスキル改善（統合） ([#385](https://github.com/s977043/river-reviewer/issues/385)) ([857d5ca](https://github.com/s977043/river-reviewer/commit/857d5ca1d05324c8b398d273b371160e3b1a648b))
* **skills:** add explicit category and version to all skill frontmatter ([af88fd3](https://github.com/s977043/river-reviewer/commit/af88fd37b858ba8b1c643cbebff9940b1e2e5f45))
* **skills:** add explicit category and version to all skill frontmatter ([1fc61c4](https://github.com/s977043/river-reviewer/commit/1fc61c4c9cc110b682be5e0213f2895279cfb99f))
* skip LLM-only skills when LLM is disabled ([a4d31cf](https://github.com/s977043/river-reviewer/commit/a4d31cf6064bdf6b3856915324426ba1a2e1a04c))
* skip LLM-only skills when LLM is disabled ([1329dc9](https://github.com/s977043/river-reviewer/commit/1329dc9ae2d0b4752b1f47bb9c17a28ba4f496a5))
* support GOOGLE_API_KEY in LLM check and add integration test ([9ac9d8e](https://github.com/s977043/river-reviewer/commit/9ac9d8e4d472fda178e35e1786f92c5d67fd39ff))
* update broken links and navigation title in skills.en.md ([af209bb](https://github.com/s977043/river-reviewer/commit/af209bbbbc3f65cf0a1a7989947557ad077d1ed3))
* update broken links to moved skills.md ([2cadbc1](https://github.com/s977043/river-reviewer/commit/2cadbc1024c52121ca1878f34ed77e926d39b154))
* update GitHub Actions versions to v6 for consistency ([593661b](https://github.com/s977043/river-reviewer/commit/593661b8e0b49ec9932c4c85623bb33b361c9608))
* update skill template link to pages/reference path ([5080e95](https://github.com/s977043/river-reviewer/commit/5080e9542260ac5bbc6b0bc3d92b5e568f31a7cf))
* Vercel siteUrl fallback for ai-review-kit ([#206](https://github.com/s977043/river-reviewer/issues/206)) ([51898ee](https://github.com/s977043/river-reviewer/commit/51898ee0b63832913a691fbf3d9a373410a2e993))


### Performance Improvements

* **ci:** optimize workflow execution ([7c6a30d](https://github.com/s977043/river-reviewer/commit/7c6a30db3d6ca9cd59edfa01e4a3e9c410e4be33))
* **ci:** optimize workflow execution ([10c2bad](https://github.com/s977043/river-reviewer/commit/10c2bad04fdad12957c462a1e54d4f9e887ca300))

## [0.13.1](https://github.com/s977043/river-reviewer/compare/v0.13.0...v0.13.1) (2026-04-17)


### Bug Fixes

* **docs:** bump action tag references to v0.13.0 ([#590](https://github.com/s977043/river-reviewer/issues/590)) ([adf3b7d](https://github.com/s977043/river-reviewer/commit/adf3b7d8c575769b0c89808a96a56143b845c4f9))

## [0.13.0](https://github.com/s977043/river-reviewer/compare/v0.12.0...v0.13.0) (2026-04-16)


### Features

* **ci:** add nightly eval workflow for review quality monitoring ([#458](https://github.com/s977043/river-reviewer/issues/458)) ([daa0833](https://github.com/s977043/river-reviewer/commit/daa0833d8515307ef49d0a51ddfd4ebff59db5bb))
* **ci:** add PlanGate PR review workflow (closes [#521](https://github.com/s977043/river-reviewer/issues/521)) ([#572](https://github.com/s977043/river-reviewer/issues/572)) ([d6b5405](https://github.com/s977043/river-reviewer/commit/d6b540566d7499dcd98c47cab275e976366cfc0b))
* **ci:** add weekly GC workflow for deterministic maintenance checks ([#570](https://github.com/s977043/river-reviewer/issues/570)) ([a01992f](https://github.com/s977043/river-reviewer/commit/a01992f583da029e9c30be6931c1db02191acc94)), closes [#522](https://github.com/s977043/river-reviewer/issues/522)
* **ci:** introduce setup-node-deps composite action and apply CI best practices ([#528](https://github.com/s977043/river-reviewer/issues/528)) ([39fe95f](https://github.com/s977043/river-reviewer/commit/39fe95f252fcb5e8f2d37ec688f648848b4bd7ed))
* **commands:** add /preflight to verify task state before multi-PR work ([#501](https://github.com/s977043/river-reviewer/issues/501)) ([6268549](https://github.com/s977043/river-reviewer/commit/62685491e47387977cd430d6edf22eced8e787a2))
* **eval:** add eval ledger section to PR template ([#454](https://github.com/s977043/river-reviewer/issues/454)) ([5e0ba5c](https://github.com/s977043/river-reviewer/commit/5e0ba5c3cc11cb15857063f7221adcab64d28a03)), closes [#438](https://github.com/s977043/river-reviewer/issues/438)
* **evals:** add nightly measure and audit pipeline ([#433](https://github.com/s977043/river-reviewer/issues/433)) ([1c802fc](https://github.com/s977043/river-reviewer/commit/1c802fca42effc2b4ff66a613999cce20ef098e0))
* **evals:** add risk-map and memory-fallback regression eval fixtures ([#469](https://github.com/s977043/river-reviewer/issues/469)) ([3ddc973](https://github.com/s977043/river-reviewer/commit/3ddc973343fdeef3c9f8005d1531f7fa81554443)), closes [#435](https://github.com/s977043/river-reviewer/issues/435)
* **memory:** add memory-context bridge for pipeline integration ([#432](https://github.com/s977043/river-reviewer/issues/432)) ([e1aee7e](https://github.com/s977043/river-reviewer/commit/e1aee7e76cfaf7eb5ff590a92eedbaa97de390ae))
* **policy:** add risk map and escalation policy ([#462](https://github.com/s977043/river-reviewer/issues/462)) ([9c560de](https://github.com/s977043/river-reviewer/commit/9c560de80cf3b3a5329c839554a78d792e81c554))
* **policy:** add suppression and resurfacing mechanism ([#434](https://github.com/s977043/river-reviewer/issues/434)) ([4b6029b](https://github.com/s977043/river-reviewer/commit/4b6029b5b9c32d5b048cb8415c3bc38986852a3e))
* progressive disclosure を明示的なスキルローディング原則として導入 ([#459](https://github.com/s977043/river-reviewer/issues/459)) ([37fcb37](https://github.com/s977043/river-reviewer/commit/37fcb374ce8a1e8fab5f5803ab10f08f69f770af))
* **review:** integrate adr-linker into review pipeline ([#456](https://github.com/s977043/river-reviewer/issues/456)) ([1a35681](https://github.com/s977043/river-reviewer/commit/1a35681092a26bffed0bb359b91707943a100034))
* **review:** integrate file-classifier into verifier with debug output ([#457](https://github.com/s977043/river-reviewer/issues/457)) ([e1d3f42](https://github.com/s977043/river-reviewer/commit/e1d3f427e3c51a6d55e8ddb4171e6d516f31252f))
* Riverbed Memory v1 ライフサイクルと置換モデルを実装 ([#474](https://github.com/s977043/river-reviewer/issues/474)) ([f222087](https://github.com/s977043/river-reviewer/commit/f222087ac54f8243dd517045923bf89d56270aff))
* **schema:** add review-audit to outputKind enum (closes [#585](https://github.com/s977043/river-reviewer/issues/585)) ([#587](https://github.com/s977043/river-reviewer/issues/587)) ([1559408](https://github.com/s977043/river-reviewer/commit/155940864e40d92b5ae7b7e7c949881ce994c6a9))
* **skill:** add PlanGate evals fixtures (closes [#523](https://github.com/s977043/river-reviewer/issues/523)) ([#574](https://github.com/s977043/river-reviewer/issues/574)) ([ef3f386](https://github.com/s977043/river-reviewer/commit/ef3f386d884fb0fa065fc231ae56f166f662f144))
* **skill:** add plangate-exec-conformance spec ([#561](https://github.com/s977043/river-reviewer/issues/561)) ([de20ba1](https://github.com/s977043/river-reviewer/commit/de20ba121e298a6638e250df0f965a25c8c8df97)), closes [#520](https://github.com/s977043/river-reviewer/issues/520)
* **skill:** add plangate-plan-integrity spec ([#560](https://github.com/s977043/river-reviewer/issues/560)) ([448ecb9](https://github.com/s977043/river-reviewer/commit/448ecb9ef70edad67bfe85c7b425bc0ad3cda69d))
* 構造化レビューアーティファクトスキーマを追加 ([#460](https://github.com/s977043/river-reviewer/issues/460)) ([0cf1e2f](https://github.com/s977043/river-reviewer/commit/0cf1e2f13ecba2fcb89cbf80f58053d8803f0d2c))
* 評価を多次元レビュールーブリックに拡張 ([#470](https://github.com/s977043/river-reviewer/issues/470)) ([fc6bba6](https://github.com/s977043/river-reviewer/commit/fc6bba678e3f168bea51736a83f7793d65b62b83))


### Bug Fixes

* **ci:** grant id-token: write to unit-tests for codecov OIDC ([#546](https://github.com/s977043/river-reviewer/issues/546)) ([81127bc](https://github.com/s977043/river-reviewer/commit/81127bc14fd25f36804f82aef404f1ddaeb2deb0)), closes [#545](https://github.com/s977043/river-reviewer/issues/545)
* **docs:** clarify that review pipeline is OpenAI-only ([#490](https://github.com/s977043/river-reviewer/issues/490)) ([5fed8c1](https://github.com/s977043/river-reviewer/commit/5fed8c1da37e7c51e9eb47b0b31222bb13e4788c))
* **eval:** rubric schema scope, direction field, terminology, integrity tests ([#547](https://github.com/s977043/river-reviewer/issues/547)) ([f869ecb](https://github.com/s977043/river-reviewer/commit/f869ecb05e164476f7c683a9689f981edde0daa4)), closes [#481](https://github.com/s977043/river-reviewer/issues/481)
* **evals:** prevent stderr leak and silent failure in nightly-audit ([#472](https://github.com/s977043/river-reviewer/issues/472)) ([#473](https://github.com/s977043/river-reviewer/issues/473)) ([8ba8d8c](https://github.com/s977043/river-reviewer/commit/8ba8d8c9925bde340a704c28e19dc2a8ac4b8754))
* **review:** align silent-catch heuristic severity with skill severity ([#494](https://github.com/s977043/river-reviewer/issues/494)) ([dfbae3b](https://github.com/s977043/river-reviewer/commit/dfbae3b0b467c3575f2a4ae928976af497c7fae4))
* **schema:** align riverbed-index schema with v1 inline-entries impl (closes [#565](https://github.com/s977043/river-reviewer/issues/565)) ([#566](https://github.com/s977043/river-reviewer/issues/566)) ([432ea5f](https://github.com/s977043/river-reviewer/commit/432ea5f035b8a90dae099ad26d13f54e6097472b))
* **schemas:** tighten review-artifact schema and add ajv validation tests ([#548](https://github.com/s977043/river-reviewer/issues/548)) ([f2b08da](https://github.com/s977043/river-reviewer/commit/f2b08dab7ec9d2521248255531238c640494ba7e))
* **scripts:** respect --check flag and skip markdown table rows ([#504](https://github.com/s977043/river-reviewer/issues/504)) ([5583f80](https://github.com/s977043/river-reviewer/commit/5583f80febeca1bf58f751ed24d5546e872a87c9))

## [0.12.0](https://github.com/s977043/river-reviewer/compare/v0.11.0...v0.12.0) (2026-04-07)


### Features

* **action:** bundle GitHub Action with ncc to eliminate cold start ([1702ba2](https://github.com/s977043/river-reviewer/commit/1702ba229f5f6dbbce9bb305d40e6e64501e2459))
* **eval:** add failure taxonomy and categorized fixture reports ([#419](https://github.com/s977043/river-reviewer/issues/419)) ([707a8ec](https://github.com/s977043/river-reviewer/commit/707a8ec60197d0dd32aadd60ffb283e974cc6688))
* **eval:** add unified evaluation runner and experiment ledger ([#413](https://github.com/s977043/river-reviewer/issues/413)) ([980e0bc](https://github.com/s977043/river-reviewer/commit/980e0bc9f7650e26d7204cfa66091f9885ddf080))
* **eval:** structured fixture results and multi-axis metrics ([#417](https://github.com/s977043/river-reviewer/issues/417)) ([f261995](https://github.com/s977043/river-reviewer/commit/f261995ad9a9a0130483b1ce7a8c4cfb65e37a67))
* **memory:** add GitHub Artifact persistence for Riverbed Memory ([#425](https://github.com/s977043/river-reviewer/issues/425)) ([b85fecf](https://github.com/s977043/river-reviewer/commit/b85fecf18dbe46c9f72573e3348a3d0ff159fadc))
* **memory:** add Riverbed Memory v1 runtime ([#426](https://github.com/s977043/river-reviewer/issues/426)) ([4e94434](https://github.com/s977043/river-reviewer/commit/4e94434e9fc6edaf94033339d70e0508cc5369b1))
* **review:** add ADR/spec linker and dependency impact analyzer ([#423](https://github.com/s977043/river-reviewer/issues/423)) ([0873e05](https://github.com/s977043/river-reviewer/commit/0873e05100f2b8c81270e115110eb681f9c20537))
* **review:** add changed-files classifier ([#420](https://github.com/s977043/river-reviewer/issues/420)) ([9ba8b06](https://github.com/s977043/river-reviewer/commit/9ba8b064563a1b81227d9790cfb69c7b74af8f95))
* **review:** add rule-based finding verifier ([#418](https://github.com/s977043/river-reviewer/issues/418)) ([9cfc28e](https://github.com/s977043/river-reviewer/commit/9cfc28e9550f833286688b24c4566020127d568f))
* **review:** add test impact analyzer and config risk detector ([#422](https://github.com/s977043/river-reviewer/issues/422)) ([f74645b](https://github.com/s977043/river-reviewer/commit/f74645b7981e7edd9798ba4e9d52d3e1e43205ad))
* **review:** integrate file-classifier into execution plan ([#427](https://github.com/s977043/river-reviewer/issues/427)) ([3544e4e](https://github.com/s977043/river-reviewer/commit/3544e4e74c42e8705ad3f51d8253790b567bc73b))
* **review:** integrate verifier into review pipeline ([#430](https://github.com/s977043/river-reviewer/issues/430)) ([4d84bdc](https://github.com/s977043/river-reviewer/commit/4d84bdc01b94aa6b6ab2a71eefb66073b0c55806))


### Bug Fixes

* **docs:** deduplicate AGENT_LEARNINGS.md and fix broken GEMINI.md reference ([#414](https://github.com/s977043/river-reviewer/issues/414)) ([1194672](https://github.com/s977043/river-reviewer/commit/1194672df27f0bcd3e54ec384e0902676221a0e7))
* restore table formatting in docs/agent-layers.md ([e405ae4](https://github.com/s977043/river-reviewer/commit/e405ae44a3385bc50e3f4f803f6287ace7725e59))

## [0.11.0](https://github.com/s977043/river-reviewer/compare/v0.10.0...v0.11.0) (2026-04-01)


### Features

* **ci:** add meta-consistency validation script and CI job ([#398](https://github.com/s977043/river-reviewer/issues/398)) ([a89b905](https://github.com/s977043/river-reviewer/commit/a89b905e094a726855af8b46a4cd5858f2350eac))
* **scripts:** add review severity gate evaluator ([#401](https://github.com/s977043/river-reviewer/issues/401)) ([667094a](https://github.com/s977043/river-reviewer/commit/667094a42c761b4dd955f08ad3fca2d01882962f))
* **skills:** add Claude Code skill management skills ([#380](https://github.com/s977043/river-reviewer/issues/380)) ([8fae238](https://github.com/s977043/river-reviewer/commit/8fae238e8bc3f9b626361ca3ee11366619bffac8))
* **skills:** add Inversion+Pipeline pattern to all skills ([#399](https://github.com/s977043/river-reviewer/issues/399)) ([e0ec61b](https://github.com/s977043/river-reviewer/commit/e0ec61b463f90f07ad0f2a5b7752200ad16fca82))
* **skills:** スキル管理スキルに5パターン設計システムを導入 ([#382](https://github.com/s977043/river-reviewer/issues/382)) ([9fa274a](https://github.com/s977043/river-reviewer/commit/9fa274a2efbe724380c3f6c5279292576d4bfe4d))


### Bug Fixes

* **codex:** address PR review feedback ([b31d901](https://github.com/s977043/river-reviewer/commit/b31d901872ed86b211281d67173e25bdc713cbb5))
* **meta:** update version refs to v0.10.0 and unify canonical URL ([#391](https://github.com/s977043/river-reviewer/issues/391), [#392](https://github.com/s977043/river-reviewer/issues/392)) ([8bc2a5d](https://github.com/s977043/river-reviewer/commit/8bc2a5dfa17dc22f01bc69b0b7c0bba2c7e67e4d))
* **readme:** correct license table to match actual LICENSE file (MIT) ([5a06394](https://github.com/s977043/river-reviewer/commit/5a06394d1bfe4e2e442f6b8d6dda55496af33a63))
* **scripts:** add .catch() handler and expand check scope in meta-consistency ([54823f3](https://github.com/s977043/river-reviewer/commit/54823f37a8bc62c52680c747e5ecdd74fb173d1f))
* **skills:** 5パターン診断に基づくスキル改善（統合） ([#385](https://github.com/s977043/river-reviewer/issues/385)) ([857d5ca](https://github.com/s977043/river-reviewer/commit/857d5ca1d05324c8b398d273b371160e3b1a648b))

## [0.10.0](https://github.com/s977043/river-reviewer/compare/v0.9.0...v0.10.0) (2026-03-19)


### Features

* **agent-skills:** add 5 routing agent skills for river-reviewer ([da7e7fe](https://github.com/s977043/river-reviewer/commit/da7e7feac42e0779fdf31b49b2eb11ee4f7876fd))
* **skills:** add adversarial review skills (Pre-mortem, War Game, Logic Torturing) ([#372](https://github.com/s977043/river-reviewer/issues/372)) ([baa3bc6](https://github.com/s977043/river-reviewer/commit/baa3bc6127f272302b7d24d924a45b5d70ea00dc))
* レビュー基盤改善と敵対的レビュースキルの追加 ([#371](https://github.com/s977043/river-reviewer/issues/371)) ([a4595b2](https://github.com/s977043/river-reviewer/commit/a4595b2e2267cc27c700da365daa863e5bb4efbb))


### Bug Fixes

* **agent-skills:** add missing References section to 4 routing agent skills ([c3f5a51](https://github.com/s977043/river-reviewer/commit/c3f5a51dec1b1cdb0efd751c9ba5f1b480f0c2de))
* **agent-skills:** address PR review comments on routing skills ([2d2c1ff](https://github.com/s977043/river-reviewer/commit/2d2c1ffb480107b3f292eab88f05ba9a13543508))
* **agent-skills:** fix remaining short-form skill ID in testing ROUTING.md ([d2be57d](https://github.com/s977043/river-reviewer/commit/d2be57d259b7af9269a544923f1061dbec1907d1))
* **agent-skills:** fix severity validation and exclude routing skills from planner ([bc2a55c](https://github.com/s977043/river-reviewer/commit/bc2a55cc52b3d346c7d95ed1afce80fe2d2178d2))
* **docs:** correct npm script name eval:skills → eval:fixtures ([4e29419](https://github.com/s977043/river-reviewer/commit/4e29419480312c5c8b039c045c58355bb252ed77))
* resolve Docusaurus duplicate ID error and address review feedback ([c2087ef](https://github.com/s977043/river-reviewer/commit/c2087ef2e609a5ba650c91c8e8e9f45518f4489a))
* **skills:** add explicit category and version to all skill frontmatter ([1fc61c4](https://github.com/s977043/river-reviewer/commit/1fc61c4c9cc110b682be5e0213f2895279cfb99f))

## [0.9.0](https://github.com/s977043/river-reviewer/compare/v0.8.0...v0.9.0) (2026-02-28)


### Features

* **runner:** enable runtime loading of agent-skills and update audit script ([01fc8a2](https://github.com/s977043/river-reviewer/commit/01fc8a20f9f7decf83fe3cff951ec22189f4e3b5))
* **skills:** add Agent Skills (SKILL.md) import/export bridge ([#349](https://github.com/s977043/river-reviewer/issues/349)) ([305f14c](https://github.com/s977043/river-reviewer/commit/305f14c4b610b90e8ff45afd88fdb1d516c7584a))
* **skills:** add entry skill river-reviewer ([ece1790](https://github.com/s977043/river-reviewer/commit/ece1790371a44ba1b6d6245e1d80475ab8fe2b72)), closes [#313](https://github.com/s977043/river-reviewer/issues/313)
* **skills:** Agent Skills (SKILL.md) bridge with review enhancements ([#350](https://github.com/s977043/river-reviewer/issues/350)) ([93c4ba5](https://github.com/s977043/river-reviewer/commit/93c4ba58ec46869ce342e0659afed178a9c5a3c1))
* 型駆動設計ガードとレビュー自動化境界ガードを追加 ([#352](https://github.com/s977043/river-reviewer/issues/352)) ([3616261](https://github.com/s977043/river-reviewer/commit/3616261bf59d47bb048851b7856fb4c5ae3e145a))


### Bug Fixes

* address additional review comments ([22800e1](https://github.com/s977043/river-reviewer/commit/22800e192b94673ab0435aebcba3cbd6c219be68))
* address review comments on AGENTS.md ([f21474c](https://github.com/s977043/river-reviewer/commit/f21474cc0a9f33b93b5088fb9c25fb1f855bde7b))
* address review comments on templates ([1e3159e](https://github.com/s977043/river-reviewer/commit/1e3159e12f169c15158c54f59e7c78063bbde337))
* agents.md dead link and root allowlist cleanup ([#360](https://github.com/s977043/river-reviewer/issues/360)) ([47df063](https://github.com/s977043/river-reviewer/commit/47df063a9ccbf93a65b055016aa6b745aefed5c7))
* **ci:** update .lychee.toml for latest lychee parser compatibility ([#368](https://github.com/s977043/river-reviewer/issues/368)) ([2d3da5a](https://github.com/s977043/river-reviewer/commit/2d3da5a400fb268e6e0492f1a6c16424a3cb7484))
* enforce branch policy in agent configuration ([#353](https://github.com/s977043/river-reviewer/issues/353)) ([f54bb6f](https://github.com/s977043/river-reviewer/commit/f54bb6fd1a168c297c08f0f727c6dbfbcf4a5498))
* Git diffのmaxBufferを拡大 ([f36af63](https://github.com/s977043/river-reviewer/commit/f36af63c6580eb0a376842c0825f3d14f66c1010))
* increase maxBuffer for large diffs ([db81630](https://github.com/s977043/river-reviewer/commit/db81630bd19b830e49a8fe152de562b51872959a))
* **scripts:** skip agent-skills in legacy validator ([18cac4f](https://github.com/s977043/river-reviewer/commit/18cac4fd82ee5db59ad9c11292e8a02f587df4c6))
* **security:** address PR [#350](https://github.com/s977043/river-reviewer/issues/350) review findings for agent skill bridge ([#361](https://github.com/s977043/river-reviewer/issues/361)) ([eb4e7a4](https://github.com/s977043/river-reviewer/commit/eb4e7a4fd3dd4d12e430d97a15eb745152d2cca1))
* skip LLM-only skills when LLM is disabled ([1329dc9](https://github.com/s977043/river-reviewer/commit/1329dc9ae2d0b4752b1f47bb9c17a28ba4f496a5))
* support GOOGLE_API_KEY in LLM check and add integration test ([9ac9d8e](https://github.com/s977043/river-reviewer/commit/9ac9d8e4d472fda178e35e1786f92c5d67fd39ff))

## [0.8.0](https://github.com/s977043/river-reviewer/compare/v0.7.1...v0.8.0) (2026-01-10)


### Features

* **dry-run:** ヒューリスティック対応スキルのみ dry-run で実行 ([3f23b9b](https://github.com/s977043/river-reviewer/commit/3f23b9b9fc191dce312e83adf977055366c3943d))
* **output:** スキル単位で指摘をグループ化 ([560493c](https://github.com/s977043/river-reviewer/commit/560493c22eec689deb2b37117d711c3ac5868b7e))
* **skills:** add skills audit script and report ([7ac29b4](https://github.com/s977043/river-reviewer/commit/7ac29b4975059ab63c1e323e8bd21bd955eab3db)), closes [#309](https://github.com/s977043/river-reviewer/issues/309)


### Bug Fixes

* **lint:** add language to fenced code blocks ([3bcaa21](https://github.com/s977043/river-reviewer/commit/3bcaa212b137416b728b3ab685d1fc3ece6ddcbb))
* Markdown インジェクション対策と出力順序の安定化 ([39d0fff](https://github.com/s977043/river-reviewer/commit/39d0fff91d5cadb8f2d49f54ed09e17ce919cecf))

## [0.7.1](https://github.com/s977043/river-reviewer/compare/v0.7.0...v0.7.1) (2026-01-07)


### Bug Fixes

* **ci:** ignore CHANGELOG.md in lint ([697417b](https://github.com/s977043/river-reviewer/commit/697417bc66a8d4c2fefda90bf235bf31316b2b19))


### Performance Improvements

* **ci:** optimize workflow execution ([10c2bad](https://github.com/s977043/river-reviewer/commit/10c2bad04fdad12957c462a1e54d4f9e887ca300))

## [0.7.0](https://github.com/s977043/river-reviewer/compare/v0.6.1...v0.7.0) (2026-01-05)


### Features

* add config file review skill and improve fallback messages ([102dab0](https://github.com/s977043/river-reviewer/commit/102dab03da191b8157d37a8323ea9b953f44f031))


### Bug Fixes

* format CHANGELOG.md to pass prettier checks ([889123d](https://github.com/s977043/river-reviewer/commit/889123d04211ab0c2e299abfb01bcaeb693bb29b))
* improve markdown output format for review findings ([78f0847](https://github.com/s977043/river-reviewer/commit/78f08471d8d536f378e04cb6cebc7e1fd9894f57))
* remove trim() to preserve leading newline in markdown output ([b1b0abe](https://github.com/s977043/river-reviewer/commit/b1b0abeb0e066fadc332484587aeaa0f3af7e01c))
* update broken links and navigation title in skills.en.md ([af209bb](https://github.com/s977043/river-reviewer/commit/af209bbbbc3f65cf0a1a7989947557ad077d1ed3))
* update broken links to moved skills.md ([2cadbc1](https://github.com/s977043/river-reviewer/commit/2cadbc1024c52121ca1878f34ed77e926d39b154))
* update skill template link to pages/reference path ([5080e95](https://github.com/s977043/river-reviewer/commit/5080e9542260ac5bbc6b0bc3d92b5e568f31a7cf))

## [0.6.1](https://github.com/s977043/river-reviewer/compare/v0.6.0...v0.6.1) (2026-01-05)

### Bug Fixes

- address CI lint errors (MD012, MD004) and review feedback (security, robustness) ([7c52477](https://github.com/s977043/river-reviewer/commit/7c5247762b20bb4b941c884c4416e246f6c274ca))

## [0.6.0](https://github.com/s977043/river-reviewer/compare/v0.5.0...v0.6.0) (2026-01-04)

### Features

- add Claude Code best practices (hooks, commands, enhanced CLAUDE.md) ([#290](https://github.com/s977043/river-reviewer/issues/290)) ([feb3879](https://github.com/s977043/river-reviewer/commit/feb3879d6496fe5dec8b89c99d105b43a7ed7451))

## [0.5.0](https://github.com/s977043/river-reviewer/compare/v0.4.0...v0.5.0) (2025-12-30)

### Features

- **skills:** add security-privacy-design skill ([#264](https://github.com/s977043/river-reviewer/issues/264)) ([e9edfef](https://github.com/s977043/river-reviewer/commit/e9edfefd5dd2441985c7899fdc7a15410921691a))

## [0.4.0](https://github.com/s977043/river-reviewer/compare/v0.3.0...v0.4.0) (2025-12-30)

### Features

- **skills:** add architecture-validation-plan skill ([#260](https://github.com/s977043/river-reviewer/issues/260)) ([b959c56](https://github.com/s977043/river-reviewer/commit/b959c56d60207e5b0e24ebe663b6eb4d6999dca9))
- **skills:** add cache-strategy-consistency skill ([#262](https://github.com/s977043/river-reviewer/issues/262)) ([99b336c](https://github.com/s977043/river-reviewer/commit/99b336c13e4310c179ada9b35bdcf143ccc71fc0))
- **skills:** add multitenancy-isolation skill ([#261](https://github.com/s977043/river-reviewer/issues/261)) ([685280b](https://github.com/s977043/river-reviewer/commit/685280b41fff3671f8cb6dd8f0b83db6db6fbeef))

## [0.3.0](https://github.com/s977043/river-reviewer/compare/v0.2.0...v0.3.0) (2025-12-30)

- add comprehensive link checking system with security validation ([#256](https://github.com/s977043/river-reviewer/issues/256)) ([718e3ff](https://github.com/s977043/river-reviewer/commit/718e3ff32c3d662615f5cf7331096fa416dc88bf))
- add skill-eval CI workflow and migrate logging-observability skill ([#259](https://github.com/s977043/river-reviewer/issues/259)) ([f4ea416](https://github.com/s977043/river-reviewer/commit/f4ea4163947b35a3d62ca894b37d144eb5fd24b7))

## v0.2.0—2025-12-29

### Runners Architecture

- **Runners Architecture Refactoring:** Separated skills (product) from execution environments (adapters)
- Added `runners/core/` with skill loader and execution planning components
- Added `runners/cli/` with command-line interface for local review execution
- Added `runners/node-api/` with programmatic TypeScript API for integrations
- Moved GitHub Action from `.github/actions/river-reviewer/` to `runners/github-action/`

### Breaking Changes

⚠️ **Important:** This release contains breaking changes. See [Migration Guide](docs/migration/runners-migration-guide.md) for upgrade instructions.

1. **GitHub Action Path Changed:**
   - **Old (v0.1.x):** `s977043/river-reviewer/.github/actions/river-reviewer@v0.1.1`
   - **New (v0.2.0+):** `s977043/river-reviewer/runners/github-action@v0.2.0`
   - **Migration:** Update all workflow files to use the new path
   - **Compatibility:** v0.1.1 continues to work with old path, but won't receive new features

2. **Core Module Imports Changed (Contributors Only):**
   - **Old:** `import { loadSkills } from './src/lib/skill-loader.mjs'`
   - **New:** `import { loadSkills } from './runners/core/skill-loader.mjs'`
   - **Impact:** Only affects direct imports of core modules (rare)

### Migration Resources

- **Full Migration Guide:** [docs/migration/runners-migration-guide.md](docs/migration/runners-migration-guide.md)
- **Deprecation Notice:** [DEPRECATED.md](docs/deprecated.md)
- **Architecture Overview:** [docs/architecture.md](docs/architecture.md)

### Documentation

- Updated all examples to use new `runners/github-action` path
- Added comprehensive migration documentation
- Updated README and tutorials with new architecture references

### Related Issues

- Epic #242: Runners Architecture Refactoring
- #243: Create runners/ directory structure
- #244: Move GitHub Action
- #245: Update all workflow and documentation references
- #246: Create CLI runner interface
- #247: Create Node API runner interface
- #240: Add backward compatibility documentation
- #241: Fix LICENSE standardization

## v0.1.1—2025-12-13

- Fixed the composite GitHub Action to work reliably when used from external repositories (installing dependencies from the action repo root).
- Added idempotent PR comment posting (updates an existing River Reviewer comment instead of duplicating).
- Added a minimal always-on "Hello Skill" to guarantee end-to-end behavior on any diff.
- Aligned milestone title formatting with `.github/workflows/auto-milestone.yml` and adjusted dash normalization logic accordingly.
- Updated CLI output for PR comments and tuned prompts to prefer Japanese review messages.

## v0.1.0—2025-12-12

- Added JSON Schema 2020-12 output format with `issues` array and `summary` aggregation (breaking for consumers of the old flat schema).
- Added upstream/midstream/downstream sample skills with YAML frontmatter.
- Added local CLI (`river run`) with diff optimization, cost estimation, and dry-run fallback behavior.
- Added composite GitHub Action (`runners/github-action`) and refreshed README/tutorial examples.
- Added the Riverbed Memory design draft under `pages/explanation/`.
- Added additional downstream and midstream skills (coverage gaps, flaky tests, test existence, TypeScript null safety).

### Breaking changes

- `schemas/output.schema.json` now returns an array of issues plus a summary object. Any tools/CI consuming the previous structure must update.

### Release checklist

- `main` の更新後、Release PR（release-please）が作成されていることを確認する。
- Release PR をマージしてリリースを確定する（タグ発行と GitHub Release は CI が実施）。
- `v0` のようなエイリアスタグは CI が最新リリースへ追従させる。
