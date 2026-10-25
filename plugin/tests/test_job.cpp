// Preview jobs without the game: the request, the RGBA recovery, the TGA, the
// answer, and the runner driven by fake frames, Presents and console answers.

#include "job.hpp"
#include "json.hpp"

#include <cassert>
#include <cstdio>
#include <deque>
#include <functional>
#include <map>
#include <optional>
#include <string>
#include <vector>

using etch::Bgra;
using etch::Grab;
using etch::JobRequest;
using etch::JobResult;
using etch::JobRunner;
using etch::Rect;
using etch::json::Parse;
using etch::json::Value;

namespace {

Value Json(const std::string& text) {
    const auto parsed = Parse(text);
    assert(parsed.value);
    return *parsed.value;
}

const char* const kRequest =
    R"({"id":7,"type":"job","reload":["etch_goto.gui","etchw_goto.gui"],"textures":["gfx//interface//x.tga"],)"
    R"("localisation":true,"black":"etch_goto_box_backdrop","white":"etchw_goto_box_backdrop",)"
    R"("crop":{"x":165,"y":215,"width":333,"height":454},"output":"C:\\storage\\captures\\job-7.tga"})";

void TestReadRequest() {
    JobRequest r;
    assert(!etch::ReadJobRequest(Json(kRequest), r));
    assert((r.reload == std::vector<std::string>{"etch_goto.gui", "etchw_goto.gui"}));
    assert(r.textures.size() == 1 && r.textures[0] == "gfx//interface//x.tga");
    assert(r.localisation);
    assert(r.black == "etch_goto_box_backdrop" && r.white == "etchw_goto_box_backdrop");
    assert(r.crop.x == 165 && r.crop.y == 215 && r.crop.width == 333 && r.crop.height == 454);
    assert(r.output == "C:\\storage\\captures\\job-7.tga");

    // Textures and localisation are optional.
    assert(!etch::ReadJobRequest(
        Json(
            R"({"reload":["a.gui"],"black":"b","white":"w","crop":{"x":0,"y":0,"width":1,"height":1},"output":"D:/x/y.TGA"})"),
        r));
    assert(r.textures.empty() && !r.localisation);

    const char* const bad[] = {
        R"({"black":"b","white":"w","crop":{"x":0,"y":0,"width":1,"height":1},"output":"C:\\a.tga"})",
        R"({"reload":[],"black":"b","white":"w","crop":{"x":0,"y":0,"width":1,"height":1},"output":"C:\\a.tga"})",
        R"({"reload":[""],"black":"b","white":"w","crop":{"x":0,"y":0,"width":1,"height":1},"output":"C:\\a.tga"})",
        R"({"reload":["a"],"white":"w","crop":{"x":0,"y":0,"width":1,"height":1},"output":"C:\\a.tga"})",
        R"({"reload":["a"],"black":"b","white":"w","crop":{"x":0,"y":0,"width":0,"height":1},"output":"C:\\a.tga"})",
        R"({"reload":["a"],"black":"b","white":"w","crop":{"x":-1,"y":0,"width":1,"height":1},"output":"C:\\a.tga"})",
        R"({"reload":["a"],"black":"b","white":"w","crop":{"x":0,"y":0,"width":1,"height":1},"output":"a.tga"})",
        R"({"reload":["a"],"black":"b","white":"w","crop":{"x":0,"y":0,"width":1,"height":1},"output":"C:\\a.png"})",
        R"({"reload":["a"],"black":"b","white":"w","crop":{"x":0,"y":0,"width":1,"height":1},"output":"C:\\a.tga","localisation":1})",
    };
    for (const char* text : bad) assert(etch::ReadJobRequest(Json(text), r).has_value());
}

Bgra Pixels(std::vector<std::uint8_t> bgra, std::uint32_t width) {
    Bgra out;
    out.width = width;
    out.height = static_cast<std::uint32_t>(bgra.size() / 4 / width);
    out.pixels = std::move(bgra);
    return out;
}

// Source-over of straight (r, g, b, a) on a grey background, rounded as a GPU does.
std::vector<std::uint8_t> Over(int r, int g, int b, int a, int background) {
    const auto blend = [&](int c) { return static_cast<std::uint8_t>((c * a + background * (255 - a) + 127) / 255); };
    return {blend(b), blend(g), blend(r), 255};
}

void TestRecover() {
    std::vector<std::uint8_t> black, white;
    const int pixels[][4] = {{200, 120, 40, 255}, {200, 120, 40, 0}, {200, 120, 40, 128}, {10, 250, 90, 32}};
    for (const auto& p : pixels) {
        const auto b = Over(p[0], p[1], p[2], p[3], 0);
        const auto w = Over(p[0], p[1], p[2], p[3], 255);
        black.insert(black.end(), b.begin(), b.end());
        white.insert(white.end(), w.begin(), w.end());
    }
    const Bgra out = etch::RecoverStraight(Pixels(black, 2), Pixels(white, 2));
    assert(out.width == 2 && out.height == 2 && out.pixels.size() == 16);
    // Opaque: colour as drawn.
    assert(out.pixels[0] == 40 && out.pixels[1] == 120 && out.pixels[2] == 200 && out.pixels[3] == 255);
    // Clear: nothing.
    assert(out.pixels[4] == 0 && out.pixels[5] == 0 && out.pixels[6] == 0 && out.pixels[7] == 0);
    // Half: alpha exact, colour within the 8-bit quantisation (etch#22: within 4 levels where a >= 32).
    assert(out.pixels[11] == 128);
    const auto near = [](int got, int want, int levels) { return got >= want - levels && got <= want + levels; };
    assert(near(out.pixels[8], 40, 1) && near(out.pixels[9], 120, 1) && near(out.pixels[10], 200, 1));
    assert(out.pixels[15] == 32);
    assert(near(out.pixels[12], 90, 4) && near(out.pixels[13], 250, 4) && near(out.pixels[14], 10, 4));

    // White below black (not source-over) clamps to opaque.
    const Bgra odd = etch::RecoverStraight(Pixels({100, 100, 100, 255}, 1), Pixels({90, 90, 90, 255}, 1));
    assert(odd.pixels[3] == 255 && odd.pixels[0] == 100);
}

void TestTga() {
    const std::string tga = etch::TgaFile(Pixels({1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}, 3));
    assert(tga.size() == 18 + 12);
    assert(tga[2] == 2 && tga[12] == 3 && tga[13] == 0 && tga[14] == 1 && tga[15] == 0);
    assert(tga[16] == 32 && static_cast<unsigned char>(tga[17]) == 0x28);
    assert(tga[18] == 1 && tga[29] == 12);
}

// A fake game: queued main-thread work runs at the next Frame(), Present()
// grabs from a fixed back buffer, and the console answers from a table.
struct FakeGame {
    std::deque<std::function<void()>> main;
    std::deque<std::function<void()>> later;
    std::vector<std::string> lines;
    std::map<std::string, etch::ConsoleResult> answers;
    std::uint64_t frame = 100;
    double now = 0;
    std::string open;  // what the fake game shows
    std::map<std::string, std::string> files;
    bool presents = true;

    JobRunner::Env Env() {
        return {
            .console =
                [this](const std::vector<std::string>& tokens) {
                    std::string line;
                    for (const std::string& t : tokens) line += (line.empty() ? "" : " ") + t;
                    lines.push_back(line);
                    now += 1;
                    if (auto it = answers.find(line); it != answers.end()) return it->second;
                    if (tokens[0] == "window" && tokens[1] == "open") open = tokens[2];
                    if (tokens[0] == "window" && tokens[1] == "close") open.clear();
                    etch::ConsoleResult r;
                    r.called = true;
                    r.success = true;
                    r.text = "done";
                    return r;
                },
            .run_on_main =
                [this](std::function<void()> work) {
                    main.push_back(std::move(work));
                    return true;
                },
            .run_later = [this](std::function<void()> work) { later.push_back(std::move(work)); },
            .now_ms = [this] { return now; },
            .frame = [this] { return frame; },
            .write_file =
                [this](const std::string& path, const std::string& bytes, std::string&) {
                    files[path] = bytes;
                    return true;
                },
        };
    }

    // One frame of the main loop: Present, then the queued work, then the frame event.
    void Frame(JobRunner& runner) {
        ++frame;
        now += 6;
        if (presents && runner.Capturing()) {
            runner.OnPresent([this](const Rect& crop) {
                Grab g;
                g.crop = crop;
                g.image.width = crop.width;
                g.image.height = crop.height;
                const std::uint8_t level = open.rfind("etchw_", 0) == 0 ? 255 : 0;
                g.image.pixels.assign(static_cast<std::size_t>(crop.width) * crop.height * 4, level);
                return g;
            });
        }
        std::deque<std::function<void()>> run;
        run.swap(main);
        for (auto& work : run) work();
        runner.OnFrame(frame);
        while (!later.empty()) {
            auto work = std::move(later.front());
            later.pop_front();
            work();
        }
    }
};

JobRequest Request() {
    JobRequest r;
    assert(!etch::ReadJobRequest(Json(kRequest), r));
    r.crop = {10, 20, 3, 2};
    return r;
}

void TestRunner() {
    FakeGame game;
    JobRunner runner(game.Env());
    std::optional<JobResult> result;
    const auto done = [&](const JobResult& r) { result = r; };

    assert(!runner.Start(Request(), done));
    // One job at a time.
    const auto busy = runner.Start(Request(), done);
    assert(busy && busy->code == "busy");
    for (int i = 0; i < 5 && !result; ++i) game.Frame(runner);
    assert(result && result->error.empty());
    assert((game.lines == std::vector<std::string>{"reload etch_goto.gui", "reload etchw_goto.gui",
                                                   "reloadtexture gfx//interface//x.tga", "reloadloc",
                                                   "window open etch_goto_box_backdrop",
                                                   "window open etchw_goto_box_backdrop"}));
    assert(result->commands.size() == 6 && result->commands[0].success && result->commands[0].text == "done");
    assert(result->crop.width == 3 && result->crop.height == 2);
    assert(result->white_frame == result->black_frame + 1);
    // Black over black and white over white: a clear crop.
    const std::string& tga = game.files.at("C:\\storage\\captures\\job-7.tga");
    assert(tga.size() == 18 + 3 * 2 * 4);
    assert(tga[18 + 3] == 0);
    assert(result->total_ms > 0 && result->commands_ms > 0);

    const Value answer = Json(etch::JobAnswer(7, *result));
    assert(answer.Find("ok")->AsBool() == true);
    assert(answer.Find("output")->AsString() == "C:\\storage\\captures\\job-7.tga");
    assert(answer.Find("crop")->Find("x")->AsUint() == 10u);
    assert(answer.Find("frames")->Find("white")->AsUint() == result->white_frame);
    assert(answer.Find("ms")->Find("total")->kind() == Value::Kind::Number);
    assert(answer.Find("commands")->AsArray()->size() == 6);

    // The next job closes the white wrapper first, before any reload.
    result.reset();
    game.lines.clear();
    assert(!runner.Start(Request(), done));
    for (int i = 0; i < 5 && !result; ++i) game.Frame(runner);
    assert(result && result->error.empty());
    assert(game.lines.front() == "window close etchw_goto_box_backdrop");
    assert(game.lines[1] == "reload etch_goto.gui");

    // A show animation: each capture waits until its settle time has passed (6 ms per fake frame).
    result.reset();
    JobRequest settling = Request();
    settling.settle_ms = 20;
    assert(!runner.Start(settling, done));
    for (int i = 0; i < 20 && !result; ++i) game.Frame(runner);
    assert(result && result->error.empty());
    assert(result->black_ms >= 20 && result->white_ms >= 20);
    assert(result->white_frame >= result->black_frame + 4);

    JobRequest parsed;
    assert(!etch::ReadJobRequest(
        Json(R"({"reload":["a"],"black":"b","white":"w","crop":{"x":0,"y":0,"width":1,"height":1},)"
             R"("settle_ms":300,"output":"C:/a.tga"})"),
        parsed));
    assert(parsed.settle_ms == 300);
    assert(etch::ReadJobRequest(
               Json(R"({"reload":["a"],"black":"b","white":"w","crop":{"x":0,"y":0,"width":1,"height":1},)"
                    R"("settle_ms":5001,"output":"C:/a.tga"})"),
               parsed)
               .has_value());
}

void TestRunnerFailures() {
    FakeGame game;
    JobRunner runner(game.Env());
    std::optional<JobResult> result;
    const auto done = [&](const JobResult& r) { result = r; };

    // A reload the game refuses fails the job before any window opens.
    etch::ConsoleResult refused;
    refused.called = true;
    refused.text = "Failed to reload the file";
    game.answers["reload etch_goto.gui"] = refused;
    assert(!runner.Start(Request(), done));
    for (int i = 0; i < 3 && !result; ++i) game.Frame(runner);
    assert(result && result->error == "reload_failed");
    assert(result->message.find("Failed to reload the file") != std::string::npos);
    assert(game.open.empty());
    game.answers.clear();

    // A texture that does not reload does not fail the job.
    etch::ConsoleResult no_texture = refused;
    no_texture.text = "no such texture";
    game.answers["reloadtexture gfx//interface//x.tga"] = no_texture;
    result.reset();
    assert(!runner.Start(Request(), done));
    for (int i = 0; i < 5 && !result; ++i) game.Frame(runner);
    assert(result && result->error.empty());
    assert(!result->commands[2].success && result->commands[2].text == "no such texture");
    game.answers.clear();

    // No Present: the capture times out after kCaptureFrames frames.
    game.presents = false;
    result.reset();
    assert(!runner.Start(Request(), done));
    for (std::uint64_t i = 0; i < JobRunner::kCaptureFrames + 3 && !result; ++i) game.Frame(runner);
    assert(result && result->error == "capture_timeout");
    game.presents = true;
    // The runner takes the next job.
    result.reset();
    assert(!runner.Start(Request(), done));
    for (int i = 0; i < 5 && !result; ++i) game.Frame(runner);
    assert(result && result->error.empty());

    // A console fault fails the job and every later one.
    etch::ConsoleResult fault;
    fault.called = true;
    fault.faulted = true;
    fault.fault_code = 0xC0000005u;
    game.answers["reload etch_goto.gui"] = fault;
    result.reset();
    assert(!runner.Start(Request(), done));
    for (int i = 0; i < 3 && !result; ++i) game.Frame(runner);
    assert(result && result->error == "game_fault");
    assert(result->message.find("0xC0000005") != std::string::npos);
    const auto refusal = runner.Start(Request(), done);
    assert(refusal && refusal->code == "game_fault");

    const Value answer = Json(etch::JobAnswer(9, *result));
    assert(answer.Find("ok")->AsBool() == false);
    assert(answer.Find("error")->AsString() == "game_fault");
    assert(answer.Find("commands")->AsArray() != nullptr);
}

}  // namespace

int main() {
    TestReadRequest();
    TestRecover();
    TestTga();
    TestRunner();
    TestRunnerFailures();
    std::puts("job: ok");
    return 0;
}
