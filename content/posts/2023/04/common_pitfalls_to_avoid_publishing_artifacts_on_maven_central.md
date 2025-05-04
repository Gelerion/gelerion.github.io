---
title: "Common Pitfalls to Avoid When Publishing Artifacts on Maven Central"
date: "2023-04-30T12:40:53+03:00"
lastmod: "2023-04-30T16:00:00+03:00" 
author: "Gelerion"
summary: "Are you planning to publish your first artifact to Maven Central and make it available to a wider audience? Congratulations, you're taking an important step in contributing to the open-source community! However, the process may not be as straightforward as you expect. In this post, we'll go over some common pitfalls to avoid to make your publishing experience smoother."
categories: ["Release Management", "Maven"]
tags: [
  "maven",
  "gpg"
]
keywords: [
  "Maven Central",
  "artifact publishing",
  "GPG signing",
  "Maven release plugin",
  "Sonatype OSSRH"
]

draft: false
toc: true
---

## Overview  
Are you planning to publish your first artifact to Maven Central and make it available to a wider audience? Congratulations, you're taking an important step in contributing to the open-source community! However, the process may not be as straightforward as you expect. In this post, we'll go over some common pitfalls to avoid to make your publishing experience smoother.

Before we dive into the details, it's essential to note that the [official documentation](https://central.sonatype.org/publish/publish-guide/) on Maven Central is a great resource. It's well-written, concise, and provides numerous examples. I strongly recommend reading it carefully to avoid any confusion or mistakes.

Ready-to-use examples:

-   Official demo project: **[](https://github.com/simpligility/ossrh-demo/blob/master/pom.xml)[https://github.com/simpligility/ossrh-demo/blob/master/pom.xml](https://github.com/simpligility/ossrh-demo/blob/master/pom.xml)**
-   One of my published project's pom: **[](https://github.com/Gelerion/spark-sketches/blob/master/pom.xml)[https://github.com/Gelerion/spark-sketches/blob/master/pom.xml](https://github.com/Gelerion/spark-sketches/blob/master/pom.xml)**
&nbsp;  
&nbsp;  
## The Pitfalls

Congratulations, you have configured the **`pom.xml`**, added all the plugins, and are running it. What could possibly go wrong?  
&nbsp;  
### GPG Sign Tasks Hang

This issue typically arises when you don't pass the GPG passphrase. If the passphrase is not found, GPG will prompt you for it during the build process. However, the prompt won't be shown to you, causing the process to halt indefinitely.
&nbsp;  
&nbsp;  
#### Solution
For security reasons, it is not recommended to include passwords in the **`pom.xml`** file. Instead, Maven offers a built-in password encryption solution. Refer to the **[documentation](https://maven.apache.org/guides/mini/guide-encryption.html)** for more information.

Once you encrypt the passphrase, add it to your **`settings.xml`** file. The server id should be set to **`gpg.passphrase`**.
{{< highlight xml "linenos=table,linenostart=1" >}}
<settings> 
 <servers>
   <server> 
    <id>gpg.passphrase</id> 
    <passphrase>XXXX</passphrase> 
   </server> 
 </servers>
</settings>
{{< / highlight >}}
&nbsp;  
### Git fatal: Could not read from remote repository

The **[maven-release](https://maven.apache.org/maven-release/maven-release-plugin/)** plugin can significantly simplify the release process of your artifact, , requiring only two commands:
```sh
mvn release:clean release:prepare -Dgpg.keyname="XYZ"
mvn release:perform

```

However, you may encounter the above error during the process
&nbsp;  
&nbsp;  
#### Solution
First, check the SSH keys to ensure everything is working properly. If `git` commands work from the terminal but not when running the maven release, then there are no issues with the SSH keys, revisit the SCM settings.

Check which user is performing the `git push`. If your SCM connection looks like:

```
scm:git:ssh://github.com/username/project.git
```

Then the user that performs the git push will be your `username`, but it should be the `git` user. To control the user, modify the SCM connection as follows:

```
scm:git:ssh://git@github.com/username/project.git
```

## Checking Published Artifact
After releasing the artifact, verify that it is available in the following repository:
- [https://central.sonatype.com/](https://central.sonatype.com/)  

Note that it may take some time for the artifact to appear.

In conclusion, publishing an artifact on Maven Central is a great way to share your work with a wider audience.
Good luck!
