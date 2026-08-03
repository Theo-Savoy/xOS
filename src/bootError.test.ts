// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

// Le filet de sécurité vit inline dans index.html (il doit tourner avant le
// module ES d'entrée). On extrait ce script et on l'évalue dans jsdom.
const bootScript = vi.hoisted(() => {
  // jsdom externalise `node:fs`; le helper hoisté s'exécute avant que Vitest
  // n'enveloppe le graphe de modules dans l'environnement navigateur.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  return fs.readFileSync(`${process.cwd()}/index.html`, "utf-8").match(
    /<script>([\s\S]*?)<\/script>/,
  )?.[1];
});

function loadTrap() {
  document.body.innerHTML = '<div id="root"></div>';
  new Function(bootScript!).call(window);
}

describe("filet de sécurité écran blanc (index.html)", () => {
  beforeEach(loadTrap);

  it("affiche la stack d'une erreur d'évaluation de module dans #root", () => {
    dispatchEvent(new ErrorEvent("error", { error: new ReferenceError("$RefreshSig$ is not defined") }));
    expect(document.getElementById("root")!.textContent).toContain("$RefreshSig$ is not defined");
  });

  it("ignore les erreurs de chargement de ressource (pas d'objet Error)", () => {
    dispatchEvent(new Event("error"));
    expect(document.getElementById("root")!.childElementCount).toBe(0);
  });

  it("n'écrase pas un #root déjà monté par React", () => {
    document.getElementById("root")!.appendChild(document.createElement("main"));
    dispatchEvent(new ErrorEvent("error", { error: new Error("boom") }));
    expect(document.getElementById("root")!.textContent).not.toContain("boom");
  });
});
