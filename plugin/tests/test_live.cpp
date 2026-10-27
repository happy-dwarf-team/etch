#include "json.hpp"
#include "live.hpp"

#include <cassert>
#include <cstdio>
#include <functional>
#include <optional>
#include <string>
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
                    r.text = tokens[0] == "savegame" ? "Saved" : "reloaded!";
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

void TestSaveNames() {
    assert(etch::IsSaveName("etch-restart"));
    assert(etch::IsSaveName("Etch_Restart_2"));
    assert(!etch::IsSaveName(""));
    assert(!etch::IsSaveName("../x"));
    assert(!etch::IsSaveName("a b"));
    assert(!etch::IsSaveName("x.eu4"));
    assert(!etch::IsSaveName(std::string(65, 'a')));
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
    assert((game.calls == std::vector<std::string>{"reload provinceview.gui"}));
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
    refused = jobs.Save("etch-restart", [](const etch::SaveResult&) {});
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
    assert(!jobs.Save("etch-restart", [&](const etch::SaveResult& r) { got = r; }));
    assert(jobs.Busy());
    game.Frame();
    assert(!jobs.Busy());
    assert((game.calls == std::vector<std::string>{"savegame etch-restart"}));
    const Value a = *Parse(etch::SaveAnswer(4, *got)).value;
    assert(a.Find("ok")->AsBool() == true && a.Find("success")->AsBool() == true);
    assert(a.Find("text")->AsString() == "Saved");
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
    TestSaveNames();
    TestReadRequest();
    TestCompareRoots();
    TestReloadClosesTheViewItOpened();
    TestReloadKeepsAShownView();
    TestReloadWithoutTheTree();
    TestRefusedInIronmanAndMultiplayer();
    TestFaultStopsTheConsole();
    TestSave();
    TestNoMainThread();
    std::puts("live: ok");
    return 0;
}
