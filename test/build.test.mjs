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

  assert.ok(readme.includes(`<h1 align="center">${config.title}</h1>`));
  assert.match(readme, /## Apps/);
  assert.match(readme, /## Packages/);
  assert.match(readme, /## Resources/);
  assert.doesNotMatch(readme, /## Original projects/);
  assert.doesNotMatch(readme, /## Forks/);
  assert.doesNotMatch(readme, /## Archive/);
  assert.match(readme, /img\.shields\.io/);
  assert.doesNotMatch(readme, /<p align="center">\[!\[/);
  assert.match(readme, /\| Repository \| About \| Badges \|/);
  assert.match(readme, /\| :-- \| :-- \| :-- \|/);
});

test("shows only programming language badges in the profile header", () => {
  const readme = renderReadme(config, repositories);
  const headerBadges = readme
    .split("\n")
    .find((line) => line.startsWith('<p align="center"><img'));
  const languages = [...new Set(
    repositories
      .filter(({ name }) => !hidden.has(name))
      .map(({ language }) => language)
      .filter(Boolean),
  )];

  assert.ok(headerBadges);
  for (const language of languages) {
    assert.match(headerBadges, new RegExp(`alt="${language}"`));
  }
  assert.doesNotMatch(headerBadges, /GitHub @/);
  assert.doesNotMatch(headerBadges, /github\/followers/);
  assert.doesNotMatch(headerBadges, /public repos/);
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
      readme.split("\n").some((line) => line.startsWith(`| ${titleLink} |`)),
      `${repository.name} should have its own table row`,
    );
  }
});

test("places website badges first on repository badge lines", () => {
  const readme = renderReadme(config, repositories);

  for (const repository of repositories.filter(({ name, homepage }) => (
    homepage && !hidden.has(name)
  ))) {
    const titleLink = `[**${repository.name}**](${repository.html_url})`;
    const websiteBadge = "[![Website](https://img.shields.io/badge/website-4285F4?style=flat-square&logo=googlechrome&logoColor=white)]";
    const lines = readme.split("\n");
    const row = lines.find((line) => line.startsWith(`| ${titleLink} |`));
    const badgeCell = row?.split(" | ")[2];
    assert.ok(
      badgeCell?.startsWith(`${websiteBadge}(${repository.homepage})`),
      `${repository.name} should show its website as the first badge`,
    );
  }

  assert.doesNotMatch(readme, /\[Website ↗\]/);
});

test("uses sort.config.mjs priorities and hidden repositories", () => {
  const readme = renderReadme(config, repositories);
  const repositoryRows = readme
    .split("\n")
    .filter((line) => line.startsWith("| [**"))
    .join("\n");

  for (const priorities of [sortConfig.APPs, sortConfig.PKGs, sortConfig.RESs ?? []]) {
    const names = priorities.filter((name) => name && !hidden.has(name));
    for (let index = 1; index < names.length; index += 1) {
      assert.ok(
        repositoryRows.indexOf(names[index - 1]) < repositoryRows.indexOf(names[index]),
        `${names[index - 1]} should appear before ${names[index]}`,
      );
    }
  }

  for (const name of sortConfig.HIDEs) {
    assert.equal(readme.includes(`[**${name}**](`), false, `${name} should be hidden`);
  }
});

test("puts newly discovered repositories in the default section", () => {
  const newRepository = {
    name: "NewResource",
    description: "A newly discovered repository.",
    html_url: "https://github.com/qzrzz/NewResource",
    homepage: null,
    language: null,
    fork: false,
    archived: false,
  };
  const readme = renderReadme(config, [...repositories, newRepository]);
  const resources = readme.slice(readme.indexOf(`## ${config.defaultSection}`));

  assert.match(resources, /\[\*\*NewResource\*\*\]/);
});

test("skips repositories that no longer exist", () => {
  const remaining = repositories.filter(({ name }) => name !== "QLaunch");

  assert.doesNotThrow(() => renderReadme(config, remaining));
});

test("does not list the profile repository as a project", () => {
  const readme = renderReadme(config, repositories);

  assert.doesNotMatch(readme, /\[\*\*qzrzz\*\*\]/);
});
