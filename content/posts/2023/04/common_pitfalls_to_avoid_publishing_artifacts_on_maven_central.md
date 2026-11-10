---
title: "Common Pitfalls to Avoid When Publishing Artifacts on Maven Central"
date: "2023-04-30T12:40:53+03:00"
lastmod: "2026-11-08T12:00:00+02:00"
author: "Gelerion"
summary: "Publishing your first library to Maven Central looks straightforward until the release gets stuck on GPG signing or fails to push a Git tag. This post covers the pitfalls I ran into, how to diagnose them, and what changed with the Central Publisher Portal."
categories: ["Release Management", "Maven"]
tags: [
  "maven",
  "gpg",
  "maven-central"
]
keywords: [
  "Maven Central",
  "artifact publishing",
  "GPG signing",
  "Maven release plugin",
  "Central Publisher Portal",
  "central-publishing-maven-plugin"
]

draft: false
toc: true
---

> **Updated November 2026.** I first published this article in 2023. Sonatype shut down the legacy OSSRH service on June
> 30, 2025 and replaced it with the [Central Publisher
> Portal](https://central.sonatype.org/publish/publish-portal-guide/). The GPG and Git troubleshooting below still
> applies, but the publishing setup has changed. You now authenticate with a Portal user token instead of your website
> password, and you publish through a Portal-compatible integration. For Maven, Sonatype recommends
> `central-publishing-maven-plugin` in place of `nexus-staging-maven-plugin`. The [current Maven
> guide](https://central.sonatype.org/publish/publish-portal-maven/) has the full configuration. Sections that changed
> are marked *(updated)* or *(new)*.

## Overview
Publishing your first library to Maven Central looks straightforward until the release gets stuck on GPG signing or
fails to push a Git tag. Both problems are frustrating because Maven's error messages rarely point at the real cause.

Here are the problems I ran into while publishing my own library, how I diagnosed them, and what to watch for in modern
Maven builds.

Read the [official documentation](https://central.sonatype.org/publish/) first. This article covers specific failures
and does not repeat the full tutorial.

### Reference configurations

- Current setup: Sonatype's [Maven publishing guide](https://central.sonatype.org/publish/publish-portal-maven/)
- Historical example (pre-2025 OSSRH setup): [my `spark-sketches`
  pom](https://github.com/Gelerion/spark-sketches/blob/master/pom.xml). It still uses `nexus-staging-maven-plugin` and
  `s01.oss.sonatype.org`, so don't copy it as is.

## The pitfalls

Say you have configured the `pom.xml`, added the plugins, and started the release. These are the places it can fail.

### GPG signing hangs during release *(updated)*

The build stops at the `maven-gpg-plugin` step and never finishes. Two common causes need different fixes:

1. The passphrase is not available, so GPG falls back to prompting for it.
2. The prompt cannot be shown. In a non-interactive process (CI, an IDE run configuration, a release started through
   another tool), `pinentry` has no terminal to display the prompt on, and Maven just waits.

A missing secret key or a broken GPG configuration looks similar from the outside, so check `gpg --list-secret-keys`
too.

#### Solution

For local releases, let `gpg-agent` handle the passphrase, make sure `pinentry` can find your terminal, and prime the
agent so it has the passphrase cached:

```sh
export GPG_TTY=$(tty)
echo "test" | gpg --clearsign
```

Add the `export` to your shell profile so it is always set.

The priming step matters because the Maven Release Plugin runs its build in batch mode, which prevents the agent from
showing its `pinentry` prompt. If the passphrase is not already cached, signing hangs or fails.

For fully unattended releases (CI), pass the passphrase through an environment variable supplied by your secret manager.
The plugin reads `MAVEN_GPG_PASSPHRASE` by default, and the plugin docs say to set `useAgent` to `false` in this case:

```sh
MAVEN_GPG_PASSPHRASE="$SECRET_FROM_VAULT" mvn release:perform
```

> In 2023 I recommended storing an encrypted passphrase in `settings.xml` under a server with the id `gpg.passphrase`.
> That worked then, but Maven GPG Plugin 3.2.0+ discourages it, and its `bestPractices` mode rejects it. Prefer
> `gpg-agent` locally and an environment variable in CI.

When several keys are installed, pick the one to sign with explicitly (`gpg.keyname`). See the release commands below
for how to pass it through the release plugin.

### Git: fatal: Could not read from remote repository

The [maven-release-plugin](https://maven.apache.org/maven-release/maven-release-plugin/) simplifies releasing to two
commands:

```sh
mvn release:clean release:prepare
mvn release:perform -Darguments="-Dgpg.keyname=XYZ"
```

`release:prepare` checks the project and creates the Git commit and tag. The actual build, signing and deployment happen
in `release:perform`, which forks a separate Maven process. A property passed only to `prepare` does not reach it, so
pass signing options through `-Darguments`. Alternatively, set the key in your build configuration or a `settings.xml`
profile.

During the process you may hit this error:

```
fatal: Could not read from remote repository.
```

#### Solution

First check that SSH authentication works at all:

```sh
ssh -T git@github.com
```

You should see a greeting that includes your GitHub username. Note that GitHub returns exit code `1` even when
authentication succeeds, because it gives you no shell. Judge the result by the greeting, not the exit code. If you get
a permission error instead, the problem is your SSH keys or agent, not Maven. If the greeting appears and `git push`
works in your terminal but fails inside the release, look at the SCM settings.

Take an SCM connection like this:

```
scm:git:ssh://github.com/username/project.git
```

With no user in the URL, SSH defaults to your local operating-system username (unless your SSH config overrides it).
GitHub only accepts the `git` user, so authentication fails. Specify the user explicitly:

```
scm:git:ssh://git@github.com/username/project.git
```

GitHub's standard SCP-style address works too:

```
scm:git:git@github.com:username/project.git
```

### Namespace not verified *(new)*

The Portal rejects an upload when your `groupId` is not in a namespace you have registered and verified, even though
authentication succeeds.

#### Solution

Register the namespace in the Portal and complete its verification before your first release. If you sign up through
GitHub, Sonatype can automatically verify the `io.github.<username>` namespace tied to your account. For a custom domain
you need to prove ownership, for example with a DNS record. See [Sonatype's namespace
documentation](https://central.sonatype.org/register/namespace/) for the current steps.

### "Success" does not mean "published" *(new)*

With the Central Publisher Portal, a successful `mvn deploy` means the bundle was uploaded and validated, but not yet
published. By default (`waitUntil` is `validated` and `autoPublish` is `false`) the deployment waits in the Portal for a
manual publish.

#### Solution

After the release, open the [Central Publisher Portal](https://central.sonatype.com/publishing/deployments) and check
the deployment status. A validated bundle may still need a manual Publish click before it appears on Maven Central. Once
it is published, verify it on [central.sonatype.com](https://central.sonatype.com/). It can take a while to show up in
search.

For CI you can set `autoPublish` to `true`. That alone does not make Maven wait for publication to finish. Also set
`waitUntil` to `published` if you want the build to block until the artifact is out.

## Summary

Publishing a release now involves three independent systems: Git release automation, artifact signing, and Central
Portal validation and publication. Each fails in its own way, so find out which stage broke before you change any
configuration.
