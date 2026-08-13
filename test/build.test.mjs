import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import config from "../profile.config.mjs";
import { renderReadme } from "../scripts/build.mjs";
import sortConfig from "../sort.config.mjs";

const repositories = JSON.parse(
  await readFile(new URL("../data/repos.json", import.meta.url), "utf8"),
);
const hidden = new Set([
  ...config.hiddenRepositories,
  ...sortConfig.HIDEs,
]);

test("renders the profile and repository sections", () => {
  const readme = renderReadme(config, repositories);

  assert.match(readme, /<h1 align="center">qzrzz<\/h1>/);
  assert.match(readme, /## Apps/);
  assert.match(readme, /## Packages/);
  assert.match(readme, /## Resources/);
  assert.doesNotMatch(readme, /## Original projects/);
  assert.doesNotMatch(readme, /## Forks/);
  assert.doesNotMatch(readme, /## Archive/);
  assert.match(readme, /img\.shields\.io/);
  assert.doesNotMatch(readme, /<p align="center">\[!\[/);
  assert.doesNotMatch(readme, /\| Repository \|/);
  assert.doesNotMatch(readme, /\| :-- \|/);
});

test("lists every visible repository exactly once", () => {
  const readme = renderReadme(config, repositories);

  for (const repository of repositories.filter(({ name }) => !hidden.has(name))) {
    const repositoryLink = `https://github.com/${config.username}/${repository.name}`;
    const titleLink = `[**${repository.name}**](${repositoryLink})`;
    assert.equal(
      readme.split(titleLink).length - 1,
      1,
      `${repository.name} should have one title link`,
    );
    assert.ok(
      readme.split("\n").some((line) => line.startsWith(`### ${titleLink}`)),
      `${repository.name} should have its own heading`,
    );
  }
});

test("places website badges on repository heading lines", () => {
  const readme = renderReadme(config, repositories);

  for (const repository of repositories.filter(({ name, homepage }) => (
    homepage && !hidden.has(name)
  ))) {
    const titleLink = `[**${repository.name}**](${repository.html_url})`;
    const websiteBadge = "[![Website](https://img.shields.io/badge/website-4285F4?style=flat-square&logo=googlechrome&logoColor=white)]";
    assert.ok(
      readme.split("\n").includes(
        `### ${titleLink}   **/**   ${websiteBadge}(${repository.homepage})`,
      ),
      `${repository.name} should show its website badge beside its name`,
    );
  }

  assert.doesNotMatch(readme, /\[Website ↗\]/);
});

test("uses sort.config.mjs priorities and hidden repositories", () => {
  const readme = renderReadme(config, repositories);
  const repositoryHeadings = readme
    .split("\n")
    .filter((line) => line.startsWith("### "))
    .join("\n");

  assert.ok(repositoryHeadings.indexOf("QLaunch") < repositoryHeadings.indexOf("Qjiao"));
  assert.ok(repositoryHeadings.indexOf("Qjiao") < repositoryHeadings.indexOf("Qf"));
  assert.ok(repositoryHeadings.indexOf("MinMPHash") < repositoryHeadings.indexOf("TableDB"));
  assert.ok(repositoryHeadings.indexOf("TableDB") < repositoryHeadings.indexOf("indexless"));
  assert.doesNotMatch(readme, /\[\*\*ghostty\*\*\]/);
});

test("does not list the profile repository as a project", () => {
  const readme = renderReadme(config, repositories);

  assert.doesNotMatch(readme, /\[\*\*qzrzz\*\*\]/);
});
