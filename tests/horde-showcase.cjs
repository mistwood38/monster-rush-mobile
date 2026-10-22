const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { open } = require("./horde-harness.cjs");
const dir = path.resolve(__dirname, "../test-results/horde");
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const h = await open();
  try {
    const scenes = [
        ...["rifle", "machine", "shotgun", "plasma", "laser"].map((kind) => ({
          group: "weapon",
          kind,
        })),
        ...["dragon", "owl", "drone", "fairy"].map((kind) => ({
          group: "pet",
          kind,
        })),
        ...["thunder", "molten", "phantom"].map((kind) => ({
          group: "armor",
          kind,
        })),
      ],
      report = [];
    if (
      process.env.SHOWCASE_GROUP &&
      fs.existsSync(path.join(dir, "showcase-results.json"))
    )
      report.push(
        ...JSON.parse(
          fs.readFileSync(path.join(dir, "showcase-results.json")),
        ).report.filter((r) => r.group !== process.env.SHOWCASE_GROUP),
      );
    for (const scene of scenes) {
      if (
        process.env.SHOWCASE_GROUP &&
        scene.group !== process.env.SHOWCASE_GROUP
      )
        continue;
      await h.page.evaluate(async (scene) => {
        const t = __MR_TEST__;
        await t.start();
        t.freeze();
        t.setQuality(0, true);
        t.configure({
          time: 150,
          spawnTimer: 999,
          gateTimer: 999,
          crateTimer: 999,
          nextBoss: 9999,
          hp: 65,
        });
        t.runModel().nextDraft = t.runModel().eventTimer = 9999;
        for (let i = 0; i < 60; i++)
          t.spawnEnemy(
            ["grunt", "heavy", "runner", "charger", "ranged", "elite"][i % 6],
            ((i % 8) - 3.5) * 1.1,
            -5 - Math.floor(i / 8) * 3.2,
          );
        if (scene.group === "weapon") t.setWeapon(scene.kind, true);
        if (scene.group === "pet") {
          t.equipPet(scene.kind);
          t.equipPet(scene.kind);
          t.equipPet(scene.kind);
          t.runModel().pet.cooldown = 1.9;
        }
        if (scene.group === "armor") {
          t.armor(scene.kind);
          t.setWeapon(
            { thunder: "machine", molten: "plasma", phantom: "laser" }[
              scene.kind
            ],
            true,
          );
        }
        t.collectReward({ type: "lanes", amount: 1 });
        t.collectReward({ type: "damage", amount: 0.25 });
        t.configure({ hp: 60 });
        await t.resumeAudio();
        const audio = t.captureAudio(),
          video = document.querySelector("#game").captureStream(15),
          stream = new MediaStream([
            ...video.getVideoTracks(),
            ...(audio?.getAudioTracks() || []),
          ]),
          chunks = [];
        window.showRecorder = new MediaRecorder(stream, {
          mimeType: "video/webm;codecs=vp8,opus",
          videoBitsPerSecond: 800000,
          audioBitsPerSecond: 96000,
        });
        showRecorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        window.showDone = new Promise(
          (resolve) =>
            (showRecorder.onstop = () => {
              const blob = new Blob(chunks, { type: "video/webm" }),
                reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(",")[1]);
              reader.readAsDataURL(blob);
            }),
        );
        showRecorder.start();
        window.showHpTimer = setInterval(() => t.configure({ hp: 65 }), 100);
        t.freeze(false);
      }, scene);
      await h.page.waitForTimeout(scene.group === "armor" ? 15000 : 2200);
      if (scene.group === "armor")
        await h.page.waitForFunction(() => __MR_TEST__.state().time >= 163.2, {
          timeout: 60000,
        });
      await h.page.screenshot({
        path: path.join(dir, `${scene.group}-${scene.kind}-393.png`),
      });
      const r = await h.page.evaluate(async () => {
        __MR_TEST__.freeze();
        clearInterval(showHpTimer);
        showRecorder.stop();
        return {
          video: await showDone,
          stats: __MR_TEST__.hordeReport(),
          audio: __MR_TEST__.getAudio(),
          systems: __MR_TEST__.systems(),
          model: __MR_TEST__.modelAudit(),
        };
      });
      fs.writeFileSync(
        path.join(dir, `${scene.group}-${scene.kind}.webm`),
        Buffer.from(r.video, "base64"),
      );
      delete r.video;
      report.push({ ...scene, ...r });
      console.log(scene, r.stats.killed, r.model.rigs);
    }
    await h.page.setViewportSize({ width: 360, height: 800 });
    await h.page.screenshot({ path: path.join(dir, "showcase-360.png") });
    assert.deepEqual(h.errors, []);
    fs.writeFileSync(
      path.join(dir, "showcase-results.json"),
      JSON.stringify(
        {
          note: "Controlled 150s fixtures with 60 real enemies; original game rendering and mixed game audio captured in real time. HP restored and supplied equipment/skills, not a natural progression or survival benchmark. Canvas videos omit DOM HUD.",
          report,
          errors: h.errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
