#include "json.hpp"
#include "live.hpp"

#include <cassert>
#include <cstdint>
#include <cstdio>
#include <functional>
#include <optional>
#include <string>
#include <utility>
#include <vector>

using etch::GameSession;
using etch::LiveJobs;
using etch::ReloadRequest;
using etch::ReloadResult;
using etch::Root;
using etch::json::Parse;
using etch::json::Value;

namespace {

// A fake game: console lines are recorded and answered, the widget tree is a
// list of roots the console lines change, and the main thread runs queued work
// when the test says so.
struct FakeGame {
    std::vector<std::string> calls;
    std::vector<Root> roots;
    bool tree = true;
    std::optional<GameSession> session;
    bool fault_on_reload = false;
    std::vector<std::function<void()>> queued;
    double now = 0;
    // What a console line does to the tree.
    std::function<void(const std::vector<std::string>&, FakeGame&)> effect;
    // tongs.navigation: the province view, and the opens asked for with their flags.
    bool navigation = true;
    etch::ProvinceView view;
    std::vector<std::pair<std::int32_t, std::uint32_t>> opens;
    std::uint32_t open_outcome = etch::kOpened;
    bool open_shows = true;  // an "opened" province shows in the province view from the next frame

    LiveJobs::Env Env() {
        return {
            .console =
                [this](const std::vector<std::string>& tokens) {
                    std::string line;
                    for (const std::string& t : tokens) line += (line.empty() ? "" : " ") + t;
                    calls.push_back(line);
                    now += 5;
                    etch::ConsoleResult r;
                    r.called = true;
                    if (fault_on_reload && tokens[0] == "reload") {
                        r.faulted = true;
                        r.fault_code = 0xC0000005;
                        return r;
                    }
                    r.success = true;
                    r.text = tokens[0] == "autosave" ? "Autosave command started!" : "reloaded!";
                    if (effect) effect(tokens, *this);
                    return r;
                },
            .roots = [this]() -> std::optional<std::vector<Root>> {
                if (!tree) return std::nullopt;
                return roots;
            },
            .session = [this] { return session; },
            .run_on_main =
                [this](std::function<void()> work) {
                    queued.push_back(std::move(work));
                    return true;
                },
            .run_later = [](std::function<void()> work) { work(); },
            .now_ms = [this] { return now; },
            .press = {},
            .province_view = [this]() -> std::optional<etch::ProvinceView> {
                if (!navigation) return std::nullopt;
                return view;
            },
            .open_province = [this](std::int32_t province, std::uint32_t flags) -> std::optional<std::uint32_t> {
                if (!navigation) return std::nullopt;
                opens.emplace_back(province, flags);
                if (open_outcome == etch::kOpened && open_shows) {
                    view.selected = view.shown = province;
                    view.view_shown = true;
                }
                return open_outcome;
            },
        };
    }

    void Frame() {
        now += 16;
        const auto work = std::move(queued);
        queued.clear();
        for (const auto& w : work) w();
    }
};

Root MakeRoot(std::uint64_t id, const char* name, const char* file, bool visible) {
    return Root{id, name, file, visible};
}

void TestAllowedLines() {
    std::vector<std::string> tokens;
    assert(!etch::AllowedLine("reload provinceview.gui", tokens));
    assert((tokens == std::vector<std::string>{"reload", "provinceview.gui"}));
    assert(!etch::AllowedLine("  reload   Topbar.GUI ", tokens));
    assert((tokens == std::vector<std::string>{"reload", "Topbar.GUI"}));
    assert(!etch::AllowedLine("reloadloc", tokens));
    assert(!etch::AllowedLine("reloadtexture gfx//interface//topbar_UL.tga", tokens));
    assert(tokens[1] == "gfx//interface//topbar_UL.tga");
    // Never these (H10), nor anything else.
    for (const char* refused :
         {"reload guianim", "reload texture", "reload assets", "reload particle", "reload interface/provinceview.gui",
          "reload .gui", "reload a.gui b.gui", "reload", "reloadloc now", "reloadinterface",
          "window close provinceview", "savegame x", "debug_crash", "", "reload caf\xc3\xa9.gui"}) {
        assert(etch::AllowedLine(refused, tokens).has_value());
    }
}

void TestReadRequest() {
    ReloadRequest r;
    auto parse = [](const char* text) { return *Parse(text).value; };
    assert(
        !etch::ReadReloadRequest(parse(R"({"lines":["reload provinceview.gui"],"check":["interface/provinceview.gui"],)"
                                       R"("close":["DeclareWarDialog"],"keep_hidden":["provinceview"]})"),
                                 r));
    assert(r.lines.size() == 1 && r.check.size() == 1 && r.close.size() == 1 && r.keep_hidden.size() == 1);
    assert(etch::ReadReloadRequest(parse(R"({"check":["a"]})"), r).has_value());
    assert(etch::ReadReloadRequest(parse(R"({"lines":["reload guianim"]})"), r).has_value());
    assert(etch::ReadReloadRequest(parse(R"({"lines":["reloadloc"],"check":"a"})"), r).has_value());
    assert(etch::ReadReloadRequest(parse(R"({"lines":["reloadloc"],"close":["a b"]})"), r).has_value());
}

void TestCompareRoots() {
    const std::vector<Root> before = {
        MakeRoot(1, "provinceview", "interface/provinceview.gui", true),
        MakeRoot(2, "culture_item", "interface\\ProvinceView.gui", false),
        MakeRoot(3, "topbar", "interface/topbar.gui", true),
        MakeRoot(4, "colonisationpanel", "", false),  // already stale: no file
    };
    // The province view was rebuilt (a new id); the row and the top bar were not.
    const std::vector<Root> after = {
        MakeRoot(5, "provinceview", "interface/provinceview.gui", true),
        MakeRoot(2, "culture_item", "", false),
        MakeRoot(3, "topbar", "interface/topbar.gui", true),
        MakeRoot(4, "colonisationpanel", "", false),
    };
    const etch::StaleCheck check = etch::CompareRoots(before, after, {"interface//provinceview.gui"});
    assert(check.checked == 2);
    assert(check.stale.size() == 1);
    assert(check.stale[0].id == 2 && !check.stale[0].visible);
}

// The province view's reload: a rebuild gives the view a new id and shows it.
void RebuildProvinceView(const std::vector<std::string>& tokens, FakeGame& game) {
    if (tokens[0] == "reload" && tokens[1] == "provinceview.gui") {
        for (Root& root : game.roots) {
            if (root.name == "provinceview") {
                root.id += 100;
                root.visible = true;
            }
        }
    }
    if (tokens[0] == "window" && tokens[1] == "close") {
        for (Root& root : game.roots) {
            if (root.name == tokens[2]) root.visible = false;
        }
    }
}

Value AnswerOf(std::uint64_t id, const ReloadResult& result) {
    const auto parsed = Parse(etch::ReloadAnswer(id, result));
    assert(parsed.value && parsed.value->IsObject());
    return *parsed.value;
}

void TestReloadClosesTheViewItOpened() {
    FakeGame game;
    game.roots = {MakeRoot(1, "provinceview", "interface/provinceview.gui", false),
                  MakeRoot(2, "culture_item", "interface/provinceview.gui", false),
                  MakeRoot(3, "DeclareWarDialog", "interface/diplomacy.gui", true)};
    game.effect = RebuildProvinceView;
    LiveJobs jobs(game.Env());
    std::optional<ReloadResult> got;
    const ReloadRequest request{
        {"reload provinceview.gui"}, {"interface/provinceview.gui"}, {"DeclareWarDialog", "ledger"}, {"provinceview"}};
    assert(!jobs.Reload(request, [&](const ReloadResult& r) { got = r; }));
    assert(jobs.Busy());
    // A second job waits for none: it is refused.
    const auto busy = jobs.Reload(request, [](const ReloadResult&) {});
    assert(busy && busy->code == "busy");
    game.Frame();
    assert(got.has_value() && !jobs.Busy());
    assert((game.calls == std::vector<std::string>{"window close DeclareWarDialog", "reload provinceview.gui",
                                                   "window close provinceview"}));
    assert(got->error.empty());
    assert((got->closed == std::vector<std::string>{"DeclareWarDialog"}));
    assert((got->hidden_again == std::vector<std::string>{"provinceview"}));
    assert(got->tree && got->stale.checked == 2 && got->stale.stale.size() == 1);
    assert(got->stale.stale[0].name == "culture_item");
    assert(got->roots_before == 3 && got->roots_after == 3);
    assert(got->queued_ms == 16);

    const Value a = AnswerOf(7, *got);
    assert(a.Find("ok")->AsBool() == true);
    assert(a.Find("checked")->AsUint() == 2u);
    const auto* stale = a.Find("stale")->AsArray();
    assert(stale->size() == 1 && (*stale)[0].Find("name")->AsString() == "culture_item");
    assert((*a.Find("lines")->AsArray())[1].Find("text")->AsString() == "reloaded!");
    assert(a.Find("roots")->Find("after")->AsUint() == 3u);
    // Nothing is left visible: the dialog and the province view were closed.
    assert(got->visible.empty());
    assert(a.Find("visible")->AsArray()->empty());
}

void TestReloadClosesByClicks() {
    FakeGame game;
    game.roots = {MakeRoot(1, "provinceview", "interface/provinceview.gui", false),
                  MakeRoot(3, "DeclareWarDialog", "interface/countrydiplomacyview.gui", true)};
    game.effect = RebuildProvinceView;
    std::vector<std::string> clicks;
    LiveJobs::Env env = game.Env();
    env.press = [&](const std::string& selector, etch::Key key) {
        assert(key == etch::Key::Escape);
        clicks.push_back(selector);
        return etch::PressResult{true, true};
    };
    LiveJobs jobs(env);
    std::optional<ReloadResult> got;
    assert(!jobs.Reload({{"reload countrydiplomacyview.gui"},
                         {"interface/countrydiplomacyview.gui"},
                         {"DeclareWarDialog"},
                         {"provinceview"}},
                        [&](const ReloadResult& r) { got = r; }));
    // The dialog's close is a key that lands a few frames later: the lines wait for it.
    for (int frame = 0; frame < etch::kKeyFrames; ++frame) {
        game.Frame();
        assert(!got.has_value() && game.calls.empty());
    }
    assert((clicks == std::vector<std::string>{"DeclareWarDialog"}));
    game.Frame();
    assert(got.has_value() && !jobs.Busy());
    assert((game.calls == std::vector<std::string>{"reload countrydiplomacyview.gui"}));
    assert((got->closed == std::vector<std::string>{"DeclareWarDialog"}));
    assert(got->hidden_again.empty());

    // A rebuild that shows the hidden province view: it is closed again by an Escape, and the job
    // waits for the key to land.
    clicks.clear();
    got.reset();
    assert(!jobs.Reload({{"reload provinceview.gui"}, {"interface/provinceview.gui"}, {}, {"provinceview"}},
                        [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert((clicks == std::vector<std::string>{"provinceview"}));
    for (int frame = 0; frame < etch::kKeyFrames && !got.has_value(); ++frame) game.Frame();
    assert(got.has_value());
    assert((got->hidden_again == std::vector<std::string>{"provinceview"}));
    assert(!got->menu_undone);
}

void TestReloadUndoesAnEscapeThatOpenedTheMenu() {
    // Before any province was shown the rebuilt view is in no panel stack: the Escape opens the
    // game's menu, which is closed again and the view is not reported closed.
    FakeGame game;
    game.roots = {MakeRoot(1, "provinceview", "interface/provinceview.gui", false),
                  MakeRoot(2, "menu", "interface/menubar.gui", false)};
    game.effect = RebuildProvinceView;
    std::vector<std::string> presses;
    LiveJobs::Env env = game.Env();
    env.press = [&](const std::string& selector, etch::Key key) {
        assert(key == etch::Key::Escape);
        presses.push_back(selector);
        for (Root& root : game.roots) {
            if (root.name == "menu") root.visible = selector == "provinceview";
        }
        return etch::PressResult{true, true};
    };
    LiveJobs jobs(env);
    std::optional<ReloadResult> got;
    assert(!jobs.Reload({{"reload provinceview.gui"}, {"interface/provinceview.gui"}, {}, {"provinceview"}},
                        [&](const ReloadResult& r) { got = r; }));
    for (int frame = 0; frame <= etch::kKeyFrames + 1 && !got.has_value(); ++frame) game.Frame();
    assert(got.has_value());
    assert((presses == std::vector<std::string>{"provinceview", "menu"}));
    assert(got->menu_undone && got->hidden_again.empty());
    for (const Root& root : got->visible) assert(root.name != "menu");
    assert(AnswerOf(3, *got).Find("menu_undone")->AsBool() == true);
}

void TestReloadKeepsAShownView() {
    FakeGame game;
    game.roots = {MakeRoot(1, "provinceview", "interface/provinceview.gui", true)};
    game.effect = RebuildProvinceView;
    LiveJobs jobs(game.Env());
    std::optional<ReloadResult> got;
    assert(!jobs.Reload({{"reload provinceview.gui"}, {"interface/provinceview.gui"}, {}, {"provinceview"}},
                        [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert(got->hidden_again.empty());
    assert(got->stale.stale.empty() && got->stale.checked == 1);
    assert(got->visible.size() == 1 && got->visible[0].file == "interface/provinceview.gui");
    assert((game.calls == std::vector<std::string>{"reload provinceview.gui"}));
}

void TestReloadLeavesAnOffScreenView() {
    // Before any province was shown, the rebuild leaves the view visible but off screen: an Escape
    // would open the game's menu, so nothing is pressed.
    FakeGame game;
    game.roots = {MakeRoot(1, "provinceview", "interface/provinceview.gui", false)};
    game.effect = [](const std::vector<std::string>& tokens, FakeGame& g) {
        RebuildProvinceView(tokens, g);
        for (Root& root : g.roots) root.on_screen = false;
    };
    std::vector<std::string> presses;
    LiveJobs::Env env = game.Env();
    env.press = [&](const std::string& selector, etch::Key) {
        presses.push_back(selector);
        return etch::PressResult{true, true};
    };
    LiveJobs jobs(env);
    std::optional<ReloadResult> got;
    assert(!jobs.Reload({{"reload provinceview.gui"}, {"interface/provinceview.gui"}, {}, {"provinceview"}},
                        [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert(got.has_value() && got->hidden_again.empty() && presses.empty());
}

void TestReloadWithoutTheTree() {
    FakeGame game;
    game.tree = false;
    LiveJobs jobs(game.Env());
    std::optional<ReloadResult> got;
    assert(!jobs.Reload(
        {{"reloadloc", "reload topbar.gui"}, {"interface/topbar.gui"}, {"DeclareWarDialog"}, {"provinceview"}},
        [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    // Without the tree a close is sent anyway, and nothing is closed again.
    assert((game.calls == std::vector<std::string>{"window close DeclareWarDialog", "reloadloc", "reload topbar.gui"}));
    assert(!got->tree);
    const Value a = AnswerOf(1, *got);
    assert(a.Find("tree")->AsBool() == false);
    assert(a.Find("stale") == nullptr);
}

void TestRefusedInIronmanAndMultiplayer() {
    FakeGame game;
    game.session = GameSession{false, true, 1};
    LiveJobs jobs(game.Env());
    auto refused = jobs.Reload({{"reloadloc"}, {}, {}, {}}, [](const ReloadResult&) {});
    assert(refused && refused->code == "not_available");
    assert(refused->message == "reload is not available in multiplayer");
    game.session = GameSession{true, false, 2};
    refused = jobs.Save([](const etch::SaveResult&) {});
    assert(refused && refused->code == "not_available");
    // A session that turns multiplayer while the job waits is refused on the main thread.
    game.session = std::nullopt;
    std::optional<ReloadResult> got;
    assert(!jobs.Reload({{"reloadloc"}, {}, {}, {}}, [&](const ReloadResult& r) { got = r; }));
    game.session = GameSession{false, true, 3};
    game.Frame();
    assert(got->error == "not_available" && game.calls.empty());
}

void TestFaultStopsTheConsole() {
    FakeGame game;
    game.fault_on_reload = true;
    LiveJobs jobs(game.Env());
    std::optional<ReloadResult> got;
    assert(!jobs.Reload({{"reloadloc", "reload topbar.gui", "reload ledger.gui"}, {}, {}, {}},
                        [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert(got->error == "console_fault");
    assert(game.calls.size() == 2);  // the line after the fault never ran
    const Value a = AnswerOf(3, *got);
    assert(a.Find("ok")->AsBool() == false && a.Find("error")->AsString() == "console_fault");
    assert(a.Find("lines")->AsArray()->size() == 2);
    const auto refused = jobs.Reload({{"reloadloc"}, {}, {}, {}}, [](const ReloadResult&) {});
    assert(refused && refused->code == "console_broken");
}

void TestSave() {
    FakeGame game;
    game.session = GameSession{false, false, 1};
    LiveJobs jobs(game.Env());
    std::optional<etch::SaveResult> got;
    assert(!jobs.Save([&](const etch::SaveResult& r) { got = r; }));
    assert(jobs.Busy());
    game.Frame();
    assert(!jobs.Busy());
    assert((game.calls == std::vector<std::string>{"autosave"}));
    const Value a = *Parse(etch::SaveAnswer(4, *got)).value;
    assert(a.Find("ok")->AsBool() == true && a.Find("success")->AsBool() == true);
    assert(a.Find("text")->AsString() == "Autosave command started!");
}

void TestConfirm() {
    assert(etch::IsConfirmPath("DefaultConfirm/AgreeButton"));
    assert(!etch::IsConfirmPath("DefaultConfirm/CancelButton"));
    assert(!etch::IsConfirmPath("//AgreeButton"));
    FakeGame game;
    std::vector<std::string> clicked;
    LiveJobs::Env env = game.Env();
    env.press = [&](const std::string& selector, etch::Key key) {
        assert(key == etch::Key::Enter);
        clicked.push_back(selector);
        return etch::PressResult{true, true};
    };
    LiveJobs jobs(env);
    std::optional<etch::ConfirmResult> got;
    assert(!jobs.Confirm("DefaultConfirm/AgreeButton", [&](const etch::ConfirmResult& r) { got = r; }));
    assert(jobs.Busy());
    game.Frame();
    assert((clicked == std::vector<std::string>{"DefaultConfirm/AgreeButton"}));
    const Value a = *Parse(etch::ConfirmAnswer(5, *got)).value;
    assert(a.Find("found")->AsBool() == true && a.Find("pressed")->AsBool() == true);
    // Without tongs.ui there is nothing to find.
    LiveJobs blind(game.Env());
    assert(!blind.Confirm("DefaultConfirm/AgreeButton", [&](const etch::ConfirmResult& r) { got = r; }));
    game.Frame();
    assert(got->error == "no_tree");
}

void TestReloadReselectsTheProvince() {
    FakeGame game;
    game.roots = {MakeRoot(1, "provinceview", "interface/provinceview.gui", true)};
    game.effect = RebuildProvinceView;
    game.view = {295, 295, true, false, false};
    LiveJobs jobs(game.Env());
    ReloadRequest request{{"reload provinceview.gui"}, {"interface/provinceview.gui"}, {}, {"provinceview"}, true};
    std::optional<ReloadResult> got;
    assert(!jobs.Reload(request, [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    // The same province, selected again in place: no camera, no view closed.
    assert(got && got->reselected && got->reselected->province == 295 && got->reselected->outcome == "opened");
    assert(got->reselected->window == "provinceview");
    assert(
        (game.opens == std::vector<std::pair<std::int32_t, std::uint32_t>>{{295, etch::kKeepViews | etch::kNoCamera}}));
    const Value answer = AnswerOf(3, *got);
    const Value* reselected = answer.Find("reselected");
    assert(reselected && reselected->Find("province")->AsUint() == 295u);
    assert(reselected->Find("outcome")->AsString() == "opened");

    // Without `reselect`, or with no province on screen before, nothing is selected.
    game.opens.clear();
    got.reset();
    request.reselect = false;
    assert(!jobs.Reload(request, [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert(got && !got->reselected && game.opens.empty() && !AnswerOf(4, *got).Find("reselected"));
    request.reselect = true;
    game.view = {295, 295, false, false, false};  // the view was closed: it stays closed
    got.reset();
    assert(!jobs.Reload(request, [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert(got && !got->reselected && game.opens.empty());

    // A colonisation panel's province is selected again too.
    game.view = {1161, 1161, false, true, false};
    got.reset();
    assert(!jobs.Reload(request, [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert(got->reselected && got->reselected->province == 1161 && got->reselected->outcome == "opened");

    // Tongs' refusal is passed on; without the service the answer says so.
    game.view = {295, 295, true, false, false};
    game.open_outcome = 4;  // TONGS_NAV_TERRA_INCOGNITA
    got.reset();
    assert(!jobs.Reload(request, [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert(got->reselected->outcome == "terra_incognita" && got->reselected->window.empty());
    game.open_outcome = 42;
    got.reset();
    assert(!jobs.Reload(request, [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert(got->reselected->outcome == "outcome_42");
    game.navigation = false;
    got.reset();
    assert(!jobs.Reload(request, [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert(!got->reselected);  // nothing read before the lines, nothing to bring back
}

void TestReloadDoesNotReselectAnotherProvince() {
    // The view no longer shows the province after the lines: nothing is selected.
    FakeGame game;
    game.roots = {MakeRoot(1, "provinceview", "interface/provinceview.gui", true)};
    game.view = {295, 295, true, false, false};
    game.effect = [](const std::vector<std::string>&, FakeGame& g) { g.view.view_shown = false; };
    LiveJobs jobs(game.Env());
    std::optional<ReloadResult> got;
    assert(!jobs.Reload({{"reload provinceview.gui"}, {}, {}, {}, true}, [&](const ReloadResult& r) { got = r; }));
    game.Frame();
    assert(got->reselected && got->reselected->outcome == "not_shown" && game.opens.empty());
}

etch::ReselectResult ReselectNow(FakeGame& game, LiveJobs& jobs, std::int32_t province, int frames) {
    std::optional<etch::ReselectResult> got;
    assert(!jobs.ReselectProvince(province, [&](const etch::ReselectResult& r) { got = r; }));
    assert(jobs.Busy());
    for (int i = 0; i < frames && !got; ++i) game.Frame();
    assert(got && !jobs.Busy());
    return *got;
}

void TestReselectAfterARestart() {
    FakeGame game;
    LiveJobs jobs(game.Env());
    // Nothing selected and no view open: the province link's call, then a check two frames on.
    etch::ReselectResult r = ReselectNow(game, jobs, 295, 1 + etch::kShowFrames);
    assert(r.reselect.outcome == "opened" && r.reselect.window == "provinceview" && r.error.empty());
    assert((game.opens == std::vector<std::pair<std::int32_t, std::uint32_t>>{{295, etch::kKeepViews}}));
    const auto parsed = Parse(etch::ReselectAnswer(7, r));
    assert(parsed.value && parsed.value->Find("outcome")->AsString() == "opened");
    assert(parsed.value->Find("province")->AsUint() == 295u &&
           parsed.value->Find("window")->AsString() == "provinceview");

    // The player came first: any selection, a view on screen or a session view. Nothing is called.
    for (const etch::ProvinceView moved :
         {etch::ProvinceView{12, 0, false, false, false}, etch::ProvinceView{0, 12, false, false, false},
          etch::ProvinceView{12, 12, true, false, false}, etch::ProvinceView{0, 0, false, false, true}}) {
        game.view = moved;
        game.opens.clear();
        r = ReselectNow(game, jobs, 295, 1);
        assert(r.reselect.outcome == "moved_on" && game.opens.empty());
    }

    // Tongs refuses (terra incognita in an older save, the discover case): passed on, no check.
    game.view = {};
    game.open_outcome = 6;  // TONGS_NAV_DISCOVER
    r = ReselectNow(game, jobs, 295, 1);
    assert(r.reselect.outcome == "discover" && r.reselect.window.empty());
    // Called, but the view does not show it two frames later.
    game.view = {};
    game.open_outcome = etch::kOpened;
    game.open_shows = false;
    r = ReselectNow(game, jobs, 295, 1 + etch::kShowFrames);
    assert(r.reselect.outcome == "not_shown");
    // Without tongs.navigation.
    game.navigation = false;
    r = ReselectNow(game, jobs, 295, 1);
    assert(r.reselect.outcome == "no_navigation");

    // One job at a time.
    game.navigation = true;
    assert(!jobs.ReselectProvince(295, [](const etch::ReselectResult&) {}));
    const auto busy = jobs.ReselectProvince(295, [](const etch::ReselectResult&) {});
    assert(busy && busy->code == "busy");
}

void TestNoMainThread() {
    FakeGame game;
    LiveJobs::Env env = game.Env();
    env.run_on_main = [](std::function<void()>) { return false; };
    LiveJobs jobs(env);
    const auto refused = jobs.Reload({{"reloadloc"}, {}, {}, {}}, [](const ReloadResult&) {});
    assert(refused && refused->code == "no_main_thread");
    assert(!jobs.Busy());
}

}  // namespace

int main() {
    TestAllowedLines();
    TestReadRequest();
    TestCompareRoots();
    TestReloadClosesTheViewItOpened();
    TestReloadClosesByClicks();
    TestReloadKeepsAShownView();
    TestReloadLeavesAnOffScreenView();
    TestReloadUndoesAnEscapeThatOpenedTheMenu();
    TestReloadWithoutTheTree();
    TestRefusedInIronmanAndMultiplayer();
    TestFaultStopsTheConsole();
    TestSave();
    TestConfirm();
    TestReloadReselectsTheProvince();
    TestReloadDoesNotReselectAnotherProvince();
    TestReselectAfterARestart();
    TestNoMainThread();
    std::puts("live: ok");
    return 0;
}
