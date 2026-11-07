---
title: "Beyond Conversation History: Building Reliable Memory for AI Agents"
date: 2026-11-07T08:00:00+02:00
lastmod: 2026-11-07T08:00:00+02:00
author: "Gelerion"
series: [ "Agentic Harness 101" ]
draft: true
categories: [ "AI Engineering", "Software Engineering" ]
summary: "Chat logs aren't memory. Learn how to build reliable long-term memory for AI agents: capture runtime events, consolidate them into episodes, extract and reconcile semantic facts, recall context progressively with hybrid search, and version procedural playbooks—all through a cleanup agent that keeps shutting down the wrong server."
description: "Chat logs aren't memory. Build reliable long-term memory for AI agents with episodic, semantic, and procedural layers, progressive recall, and hybrid search."
tags: [
  "AI Agents",
  "Agent Memory",
  "LLM",
  "RAG",
  "Context Engineering",
  "Hybrid Search",
  "Episodic Memory",
  "Semantic Memory",
  "Procedural Memory"
]
keywords: [
  "AI agent memory",
  "long-term memory for AI agents",
  "LLM agent memory architecture",
  "agent harness",
  "episodic memory",
  "semantic memory",
  "procedural memory",
  "working memory",
  "memory consolidation",
  "progressive recall",
  "hybrid search BM25 vector",
  "context engineering",
  "RAG over chat logs"
]
slug: "beyond-conversation-history-reliable-memory-for-ai-agents"
toc: true
---

You can correct an agent's mistake today, watch it fix the problem, and still see it make the exact same mistake
tomorrow. That happens not because the model is incapable of learning from what happened, but because the next session
has no access to that experience.

In production, agents need to combine live system state with knowledge accumulated over time. APIs and monitoring tools
can tell them what's happening right now, but past actions, their outcomes, operational incidents, and human corrections
may reveal things that live state alone cannot explain. Losing that knowledge can turn an otherwise reasonable action
into a costly mistake.

The real engineering challenge is deciding what deserves to survive a session, keeping that knowledge accurate as
reality changes, and bringing it back at the exact step where the agent needs it.

## 1. When Agent Memory Fails: The “Idle” Friday Server

Suppose you run an infrastructure cleanup agent named `CostGuard` that sweeps your staging environment (`staging-cloud`)
every week to shut down idle compute instances and trim cloud spend.

Watch what happens across a single week without structured runtime memory:

* **Friday afternoon:** The agent scans `staging-cloud` and spots `gpu-bench-01`, an expensive GPU instance averaging
  0.2% CPU utilization over the past 72 hours. Following its standard cleanup playbook, it stops the instance.
* **Friday night:** QA's scheduled weekend benchmark pipeline crashes because `gpu-bench-01` is offline, paging the
  on-call engineer.
* **Monday morning:** After investigating the failure, you open a session with `CostGuard` and tell it: *"Restart
  gpu-bench-01. Friday's cleanup broke our QA regression suite. Keep the instance running until QA migrates the suite to
  the shared Kubernetes cluster."* The agent restarts the server and confirms it is back online.
* **Thursday morning:** You open a fresh session and prompt `CostGuard`: *"Run the weekly staging cost cleanup."*

The agent queries the cloud provider, lists the running instances, and checks their metrics. Once again, `gpu-bench-01`
shows near-zero CPU utilization since the restart. With no memory of Monday's instruction, it treats the server like any
other idle instance and shuts it down a second time.

Two common approaches to cross-session memory can still miss what matters here:

* **Standard RAG over chat logs misses the relevant constraint:** Look at Thursday's prompt: "Run the weekly staging
  cost cleanup." It never mentions `gpu-bench-01`, QA, or regression benchmarks. If memory retrieval only runs once
  against the user's initial request, the earlier instruction has no reason to rank high enough to make the cut. The
  agent only learns that `gpu-bench-01` is involved after it calls its cloud discovery tool mid-session.
* **Rolling session summaries blur stale history with live state:** Summaries compress history, but they can omit
  important details or carry forward observations that are no longer true. There's little value in remembering last
  week's CPU metrics or whether an instance was running several days ago—the cloud API provides live ground truth on
  demand. What matters is preserving the instruction that changes how those metrics should be interpreted.

What the agent must remember is why the instance has to stay up despite looking idle, what broke the last time it was
stopped, and what condition eventually lifts that restriction. The key is making that **knowledge** available right when
the agent is about to act on `gpu-bench-01`, even if the user never mentions the instance by name.

## 2. Runtime Architecture: Reading and Storing Memory

A common anti-pattern in agent design is giving the language model a `save_memory()` or `search_memory()` tool and
hoping it remembers to call them. Models focused on completing a task often fail to record important outcomes, and they
rarely search past sessions when they don't know relevant history exists. Conversely, pausing the user's session after
every tool call so another model can summarize what happened adds unnecessary latency.

A more reliable pattern moves memory orchestration out of the model's tool belt and into the application runtime 
wrapping the agent loop. The runtime takes responsibility for capturing execution history, maintaining persistent 
knowledge, and retrieving relevant context as a task unfolds.

But memory isn't a single store of conversation history. An operational agent needs several kinds of information: 
records of what happened, knowledge that remains useful across sessions, reusable procedures, and the immediate context 
required for its next decision. These map to four distinct types of memory that accumulate knowledge over time, 
and one ephemeral context assembled on the fly:

```text
                     APPLICATION RUNTIME
  +-----------------------------------------------------------+
  |  WORKING MEMORY (Ephemeral — rebuilt on every turn)       |
  |  [ Active Request + Live Tool Outputs + Recalled Memory ] |
  +-----------------------------------------------------------+
                 |                             ^
                 |  Execution                  | Targeted
                 |  Events                     | Recall
                 v                             |
  +-----------------------------------------------------------+
  |                     PERSISTENT MEMORY                     |
  |                                                           |
  |  +-----------------+  +---------------+  +-------------+  |
  |  | EPISODIC        |  | SEMANTIC      |  | PROCEDURAL  |  |
  |  | Past events &   |->| Standing facts|->| Playbooks & |  |
  |  | session outcomes|  | & constraints |  | workflows   |  |
  |  +-----------------+  +---------------+  +-------------+  |
  +-----------------------------------------------------------+
```

Each type serves a different purpose:
* **Episodic Memory (What happened):** Concrete records of past activities, observations, and outcomes across sessions.
* **Semantic Memory (What we know):** Standing facts, rules, preferences, and constraints that remain true beyond a
  single episode.
* **Procedural Memory (How we do things):** Reusable operational playbooks, workflows, and verification checklists for
  handling a class of tasks.
* **Working Memory (What matters right now):** The compact, token-bounded context assembled for a single model call,
  combining the active user request, live tool outputs, and recalled long-term memories.

The first three persist across sessions, though they don't all come from the same place: episodes and semantic rules are 
usually extracted from live runtime events, while procedures are often written or curated by engineers. Working memory 
is the exception—it only exists for a single turn and gets rebuilt from scratch on the next.

Here's how the four memory types apply to the `CostGuard` example:

```text
AGENT-OBSERVED EVENTS (Captured live during execution)
  Friday   | Metrics read (0.2% CPU) -> stop_instance(gpu-bench-01) succeeded
  Monday   | Engineer requests restart, explaining the QA failure
                           |
                           v
EPISODIC MEMORY (What happened)
  Cleanup  | Stopped gpu-bench-01 after observing 0.2% CPU over 72h
  Recovery | Restarted gpu-bench-01 after the shutdown broke QA benchmarks
                           |
                           v
SEMANTIC MEMORY (What we learned)
  Rule     | Keep gpu-bench-01 running until QA migrates its
           | regression suite to the shared Kubernetes cluster.
                           |
                           v
WORKING MEMORY (Recalled on next Friday's run)
  Context  | Task: Clean up idle staging instances
           | Candidate: gpu-bench-01 (0.2% CPU)
           | Active Constraint: Keep gpu-bench-01 running (QA suite)
```

### Writing Memories

Every time an agent runs a tool, receives an error, completes a task, or gets human feedback, it generates an execution
event. Capturing those events is cheap; turning them into clean, trustworthy memories takes more work. An event-driven
pipeline handles that processing asynchronously, keeping it out of the agent's execution path.

```text
+-----------------------+                     +--------------------------------+
|      Agent Loop       |    Publish Event    |        Event Log Store         |
|    Recall -> Act      | ------------------> |  (Raw tool calls & feedback)   |
+-----------^-----------+                     +---------------+----------------+
            |                                                 |
            |                                                 | Consume events;
            | Recall by scope,                                | consolidate at
            | intent & active_entities                        | checkpoints
            |                                                 v
+-----------------------+                     +--------------------------------+
|   Searchable Memory   |   Upsert Episodes   |     Consolidation Pipeline     |
| (Episodes, Facts...)  | <------------------ |  (Group, extract & reconcile)  |
+-----------------------+   & Semantic Facts  +--------------------------------+
```

During the active turn loop, the runtime publishes structured events to an append-only log as tools finish and users
respond. Because event publishing involves no LLM calls, it adds minimal overhead to the agent's execution.

Memory consolidation happens in the background via a worker or stream consumer. Rather than calling an LLM after every
single tool execution, the worker waits for meaningful checkpoints—such as a completed task, a verification failure, or
explicit user feedback. When a checkpoint fires, the worker inspects the grouped events, builds or updates an episode if
the activity is worth keeping, and extracts any new standing rules to reconcile against existing semantic facts.

### Memory in the Turn Loop

On the read side, the runtime retrieves relevant memories before deciding what to do next. Recall happens throughout the
task as new resources and observations become available:

```python
def agent_step(task, context):
    memories = recall(task, entities=context.active_entities)
    
    action = model.next_action(task, context, memories)
    result = execute(action)

    publish_event(action, result)

    return result
```

This step repeats throughout the cleanup. The initial request only describes the high-level task, so the first recall
pass pulls general workflow context. Once the agent lists the staging instances, however, the next iteration has
concrete resource identifiers to search for—surfacing any resource-specific restrictions before the agent decides what
to shut down. Meanwhile, events from the current execution are recorded without waiting for background extraction to
finish.

## 3. Episodic Memory: Capturing What Happened

An episode captures a specific experience with enough context to make it useful later. Sometimes that is a single
interaction, such as a customer reporting a service outage. Other times, the experience unfolds across several tool
calls, decisions, or even sessions.

Episode boundaries depend on the application. A coding assistant might remember a failed test and the fix that worked,
while a support agent retains an unresolved customer issue. For an operational agent, an episode might capture a cleanup
attempt involving several observations and state-changing actions.

Consider the initial cleanup. `CostGuard` inspects `gpu-bench-01`, sees almost no CPU activity over the last three days,
and shuts it down.

```text
14:00                       14:01                       14:02
[Tool Completed]            [Tool Completed]            [Activity Completed]
get_instance_metrics        stop_instance               Cleanup activity
gpu-bench-01 (0.2% CPU)     gpu-bench-01 (succeeded)    finished (Checkpoint)
      |                           |                            |
      +---------------------------+----------------------------+
                                  |
                         Grouped by activity_id
                                  |
                                  v
                    [ Consolidated Episode: ep_act_1042 ]
```

Instead of writing a single summary at the end of a chat session, the runtime records events as they happen and groups
related steps asynchronously into an episode. That preserves what the agent actually did and observed during the
operation, even when downstream consequences only become clear in a later session.

### Events vs. Episodes

Separating raw runtime events from consolidated episodes gives each record a clear job and a lean, domain-agnostic
schema.

A **Runtime Event** is a single, point-in-time record written when something happens—a tool completes, a user provides
feedback, or an activity finishes. Events are append-only and fast to write. We don't inject raw events straight into
future prompts because a single task might generate dozens of intermediate observations and retries.

| Field | Purpose |
| --- | --- |
| `event_id`, `timestamp` | Identify the event and when it happened |
| `activity_id` | Groups events belonging to the same activity or execution attempt |
| `event_type` | What happened, such as `tool.completed`, `activity.completed`, or `feedback.received` |
| `scope` | Tenant, workspace, or other access boundary |
| `entities` | Stable identifiers of resources or records involved |
| `actor` | Agent, user, or component responsible for the event |
| `evidence_ref` | Reference to the original trace, message, or tool result |
| `data` | Event-specific payload, such as tool arguments, results, or user feedback |

An **Episode** is a compact, searchable record of a meaningful experience. Built from related events, it captures what
happened, the observed execution status, and how the activity was resolved, if known.

| Field | Purpose |
| --- | --- |
| `episode_id` | Unique identifier of the recorded experience |
| `scope` | Access and retrieval boundaries |
| `entities` | Resources or records involved, indexed for later retrieval |
| `status` | Observed execution status, such as `completed`, `failed`, or `unresolved` |
| `summary` | Short description of what happened and what was observed |
| `resolution` | Optional explanation of how the experience was resolved |
| `sources` | References to the underlying events or supporting evidence |
| `created_at`, `updated_at` | When the episode was created and last updated |

All events from the same operation share an `activity_id`—for example, inspecting and stopping `gpu-bench-01` belong to
one activity, while a later recovery attempt receives another. The consolidated episode keeps the context needed for
recall without replaying the entire execution trace, while its `sources` field provides a way back to the underlying
evidence whenever more detail is needed.

### Consolidating Events

Because the background processor waits for checkpoints rather than summarizing every event as it arrives, it can
evaluate an operation as a whole. A completed activity is an obvious checkpoint; others include a failed operation,
explicit user feedback, or a long-running task reaching an intermediate milestone—an unfinished debugging session, for
example, may still contain useful context even without a final outcome.

A checkpoint triggers evaluation, but doesn't guarantee that a new episode will be created. Routine read-only checks can
be skipped or kept merely as supporting evidence for a larger experience.

```text
+-----------------------------------------------------------------------+
| 1. APPEND-ONLY EVENT LOG (Grouped by activity_id: act_1042)           |
|  - Event 1: tool.completed      (14:00)                               |
|  - Event 2: tool.completed      (14:01)                               |
|  - Event 3: activity.completed  (14:02) <-- Checkpoint fires          |
+-----------------------------------------------------------------------+
                    |                                 |
                    v                                 v
+-------------------------------------+  +------------------------------+
| 2a. APPLICATION CODE                |  | 2b. STRUCTURED LLM PASS      |
|  - Derive execution status          |  |  - Write summary (what was   |
|  - Collect entities                 |  |    attempted & observed)     |
|  - Preserve scope & evidence        |  |  - Write resolution, if any  |
+-------------------------------------+  +------------------------------+
                    |                                 |
                    +----------------+----------------+
                                     |
                                     v
+-----------------------------------------------------------------------+
| 3. SEARCHABLE MEMORY STORE                                            |
|  - Upsert Episode ep_act_1042 (Indexed by scope, entities, and time)  |
+-----------------------------------------------------------------------+
```

For events that pass this filter, the worker splits the job between application code and the language model. Application
code derives the execution status, merges entity identifiers, and collects evidence references directly from the
recorded events rather than relying on an LLM's interpretation of them. The LLM handles the narrative: a short
description of what happened and, when available, how the experience was resolved. For simple interactions, the original
event content may already be sufficient without a model pass.

### How `CostGuard` Builds an Episode

As the agent inspects and stops the instance, the runtime captures three events without relying on the model to call a
`save_memory()` tool:

```python
# CostGuard inspects gpu-bench-01
publish_runtime_event(
    activity_id="act_1042",
    event_type="tool.completed",
    entities=["cloud-instance:i-09a8f"],
    evidence_ref="trace://act_1042/metrics",
    data={
        "tool": "get_instance_metrics",
        "resource": "gpu-bench-01",
        "avg_cpu_pct": 0.2,
        "window_hours": 72,
    },
)

# CostGuard stops the instance
publish_runtime_event(
    activity_id="act_1042",
    event_type="tool.completed",
    entities=["cloud-instance:i-09a8f"],
    evidence_ref="trace://act_1042/stop",
    data={"tool": "stop_instance", "status": "succeeded"},
)

# Resource cleanup finishes, triggering a checkpoint
publish_runtime_event(
    activity_id="act_1042",
    event_type="activity.completed",
    entities=["cloud-instance:i-09a8f"],
    evidence_ref="trace://act_1042/completion",
    data={"status": "completed"},
)
```

The runtime attaches the remaining fields—such as the event ID, timestamp, actor, and scope—and records the stable cloud
resource identifier (`cloud-instance:i-09a8f`) alongside its display name.

When the checkpoint triggers `build_episode()`, the background worker combines code-derived metadata with the
LLM-generated summary:

```python
class EpisodeNarrative(BaseModel):
    summary: str
    resolution: str | None = None


def build_episode(scope: dict, activity_id: str):
    events = event_log.get_events(
        scope=scope,
        activity_id=activity_id,
    )

    if not should_keep_episode(events):
        return None

    # Compute metadata from the recorded events
    status = derive_execution_status(events)
    entities = collect_unique_entities(events)
    sources = collect_evidence_refs(events)

    # Summarize what happened
    narrative = llm.extract_structured(
        schema=EpisodeNarrative,
        context=select_relevant_evidence(events),
    )

    episode = {
        "episode_id": f"ep_{activity_id}",
        "scope": scope,
        "entities": entities,
        "status": status,
        "summary": narrative.summary,
        "resolution": narrative.resolution,
        "sources": sources,
    }

    return memory_store.upsert_episode(episode)
```

The memory store manages creation and update timestamps during persistence, producing this record:

```json
{
  "episode_id": "ep_act_1042",
  "scope": {"workspace": "staging-cloud"},
  "entities": ["cloud-instance:i-09a8f"],
  "status": "completed",
  "summary": "Stopped gpu-bench-01 after observing 0.2% average CPU utilization over the preceding 72 hours.",
  "resolution": null,
  "sources": [
    "trace://act_1042/metrics",
    "trace://act_1042/stop",
    "trace://act_1042/completion"
  ],
  "created_at": "2026-10-30T14:02:00Z",
  "updated_at": "2026-10-30T14:02:00Z"
}
```

Look closely at the `status` field: it is `completed`, not `correct` or `safe`. When the cleanup finishes, the API call
has succeeded and the QA benchmark hasn't failed yet. The episode accurately records the execution as the agent observed
it at the time. When the engineer later steps in to restart the server and explain what broke, that feedback produces a
separate recovery episode—and gives the consolidation worker something more durable to extract: a standing operational
rule.

## 4. Semantic Memory: Standing Rules and Evolving Reality

The engineer's correction does more than explain the earlier failure. It establishes knowledge that `CostGuard` must
apply long after the recovery session ends: QA depends on the instance, and it needs to stay running until the
regression suite moves to Kubernetes.

As an agent accumulates experience, relying on episodic history alone becomes impractical. You don't want it digging
through a dozen past incident summaries every time it needs to determine which restrictions currently apply to a
resource. Semantic facts give the agent direct access to reusable knowledge—whether operational rules, user preferences,
or service dependencies—while episodes preserve the history and evidence behind them.

### What a Semantic Fact Looks Like

Many operational facts are conditional or temporary: an instance exemption lasts until a workload migrates, a billing
hold lasts until an invoice clears, and a release freeze lasts until a hotfix ships. To track standing rules without
losing sight of when they expire or who established them, each semantic fact stores a small set of structured fields:

| Field | Purpose |
| --- | --- |
| `fact_id` | Unique identifier for the fact |
| `scope` | Workspace, tenant, or other boundary where the fact applies |
| `entity` | Stable identifier of the resource or subject |
| `attribute` | Property or policy being described, such as `lifecycle_policy` |
| `value` | The rule or assertion itself |
| `ends_when` | Optional condition under which the fact stops applying |
| `status` | Whether the fact is `current`, `unverified`, `superseded`, or `retired` |
| `authority_role`, `source` | Authenticated role of the source actor and reference to the supporting evidence |

Notice that the engineer's instruction doesn't expire on a fixed date; it expires on an operational condition. That
condition must be verified before the restriction can be retired—the mere passage of time or another stretch of low
utilization isn't enough.

### Extracting Rules Alongside Episodes

Fact extraction runs in the same background consolidation worker that builds episodes. When the recovery activity
reaches a checkpoint, the worker records the recovery episode and inspects the engineer's feedback for standing rules
worth carrying into future sessions.

```text
+------------------------------------------------------------------------+
| 1. APPEND-ONLY EVENT LOG (Activity: act_1043, Recovery)                |
|                                                                        |
|  - feedback.received   Engineer explains QA dependency                 |
|  - tool.completed      restart_instance succeeded                      |
|  - activity.completed  Recovery finished <-- Checkpoint                |
+------------------------------------------------------------------------+
                                    |
                                    v
+------------------------------------------------------------------------+
| 2. BACKGROUND CONSOLIDATION WORKER                                     |
|                                                                        |
|  Build Episode                                                         |
|    - Record the restart and engineer feedback                          |
|    - Upsert Episode (ep_act_1043)                                      |
|                                                                        |
|  Extract Candidate Facts                                               |
|    +-- Application Code                                                |
|    |     Scope, actor role, evidence refs, entity resolution           |
|    |                                                                   |
|    +-- Structured LLM Pass                                             |
|          Entity, attribute, standing rule, end condition               |
|                                                                        |
|  Candidate: Keep gpu-bench-01 running until QA migrates to Kubernetes  |
+------------------------------------------------------------------------+
                                    |
                                    v
+------------------------------------------------------------------------+
| 3. VALIDATION & RECONCILIATION                                         |
|                                                                        |
|  - Check authority and supporting evidence                             |
|  - Compare with existing facts for the same scope/entity/attribute     |
|  - Insert, retain, supersede, or retire as appropriate                 |
+------------------------------------------------------------------------+
                                    |
                                    v
+------------------------------------------------------------------------+
| 4. SEARCHABLE MEMORY STORE                                             |
|                                                                        |
|  Episode: ep_act_1043                                                  |
|  Fact:    fact_gpu_bench_01_policy (current)                           |
+------------------------------------------------------------------------+
```

In this example, the engineer's feedback is the source of the new rule. Other agents might extract reusable knowledge
from tool results, task outcomes, or external observations. The extraction process follows the same pattern:

```python
class ExtractedRule(BaseModel):
    entity: str
    attribute: str
    value: str
    ends_when: str | None = None


class CandidateRules(BaseModel):
    rules: list[ExtractedRule]


def extract_candidate_facts(events, episode):
    candidates = []

    for event in events:
        if event.event_type != "feedback.received":
            continue

        extracted = llm.extract_structured(
            schema=CandidateRules,
            context={
                "feedback": event.data,
                "known_entities": episode["entities"],
            },
        )

        for rule in extracted.rules:
            entity = resolve_entity(rule.entity, episode["entities"])
            if entity is None or not grounded_in_feedback(rule, event.data):
                continue

            candidates.append({
                "scope": episode["scope"],
                "entity": entity,
                "attribute": normalize_attribute(rule.attribute),
                "value": rule.value,
                "ends_when": rule.ends_when,
                "authority_role": event.actor["role"],
                "source": event.evidence_ref,
            })

    return candidates
```

The entity resolution step maps resource names mentioned in conversation to the stable identifiers already observed by
the agent, so later retrieval doesn't depend on matching the exact wording an engineer used.

Extracting a plausible instruction doesn't automatically make it an active policy, however. The runtime still checks
whether the actor is allowed to establish that rule in the target scope. In a personal assistant, an end user can set
their own meeting preferences; in a shared infrastructure workspace like `staging-cloud`, changing a server's lifecycle
policy requires an authorized engineering role. Once that role is verified from authenticated runtime metadata, the
instruction becomes a `current` fact, while the earlier shutdown episode stays intact as historical evidence.

### The Partial Evidence Trap: Why Naive Updates Break Memory

Suppose an engineer requests another staging cost review midweek. The agent queries the cloud provider and finds that
`gpu-bench-01` has remained at 0% utilization for the past 48 hours. During the same interaction, a developer comments,
*"Looks like gpu-bench-01 isn't being used anymore. We can probably shut it down."*

Both observations are captured through normal runtime events, yet neither proves that the standing restriction has
expired. Low utilization midweek is completely consistent with a machine reserved for weekend benchmarks, and the
developer's remark is speculative, offering no evidence that QA has migrated its workload.

A memory system that continually asks an LLM to rewrite a rolling entity summary—or blindly overwrites stored facts with
the latest observation—will easily mistake these signals for proof that the rule is obsolete. Imagine what happens if
the memory record shifts from *"Keep this instance running for weekend QA benchmarks"* to *"Instance has been idle for
48 hours; developer suggests shutting it down."* Both statements reflect something the agent observed, but the second
carries a different level of authority and doesn't invalidate the first. Simply replacing the old fact with the latest
observation wipes out the instruction that actually matters.

### Reconciling New Information Against Active Rules

Before accepting a new candidate fact, the consolidation worker searches for existing `current` facts matching the same
scope, canonical entity identifier, and attribute. It also separates transient observations from genuine policy updates:

```text
                +-----------------------------------------+
                |  Incoming Observation / Candidate Rule  |
                +--------------------+--------------------+
                                     |
                                     v
                +-----------------------------------------+
                |  Lookup Active Fact in Store            |
                |  Key: (scope, entity, attribute)        |
                +--------------------+--------------------+
                                     |
              +----------------------+----------------------+
              | No active fact                              | Active fact exists
              v                                             v
+-------------------------------+     +---------------------------------------------------+
| Is it an authorized rule?     |     | Compare Incoming Signal Against Active Fact       |
|                               |     +---------------------------------------------------+
|  YES -> INSERT as [current]   |     |                                                   |
|  NO  -> Keep in event log     |     |  1. Repeats same rule                             |
|         or flag as unverified |     |     -> Keep [current]; link new evidence          |
+-------------------------------+     |                                                   |
                                      |  2. Compatible telemetry (48h at 0% CPU)          |
                                      |     -> Ignore; leave [current] rule untouched     |
                                      |                                                   |
                                      |  3. Unverified contradiction (dev chat comment)   |
                                      |     -> Keep [current] rule; flag claim for review |
                                      |                                                   |
                                      |  4. Authorized change (infra_lead updates policy) |
                                      |     -> Mark old [superseded]; INSERT new [current]|
                                      |                                                   |
                                      |  5. End condition met (K8s migration verified)    |
                                      |     -> Mark old rule [retired]                    |
                                      +---------------------------------------------------+
```

When new evidence repeats an existing rule, the worker links the supporting reference without creating a duplicate. An
observation that is merely compatible with the rule, such as the 48-hour idle metrics, doesn't change anything in
semantic memory—raw telemetry already lives in the event log and cloud APIs. And when an unverified comment contradicts
an active policy, the worker preserves the standing restriction and flags the claim for review rather than letting
casual chatter override an authorized instruction.

An explicit instruction from an authorized operator is different. Suppose the infrastructure lead says, “QA has changed
its plans. Keep the instance reserved through next week’s final benchmark instead of waiting for the Kubernetes
migration.” The lead may be authorized to replace the policy even though the original migration condition hasn’t been
satisfied. The previous fact is marked as superseded, and the replacement becomes current, retaining its own source and
supporting evidence. Keeping the older version makes it possible to understand why the policy changed.

A rule can also end because its stated condition has been met. The condition itself isn't self-verifying: the runtime
needs trustworthy evidence, such as confirmation from an authorized operator or an authoritative system, before retiring
the exemption. And retiring it doesn't mean the instance must be stopped; it simply removes that particular restriction.
The agent's normal cleanup policy still determines what happens next.

In both cases, the previous knowledge remains available as history. It just no longer participates in retrieval as an
active constraint. 

In the original midweek scenario, neither the idle metrics nor the developer's comment justifies changing the
restriction. The active semantic fact therefore remains unchanged:

```json
{
  "fact_id": "fact_gpu_bench_01_policy",
  "scope": {
    "workspace": "staging-cloud"
  },
  "entity": "cloud-instance:i-09a8f",
  "attribute": "lifecycle_policy",
  "value": "Keep gpu-bench-01 running for Friday-night QA regression tests",
  "ends_when": "QA regression suite migrated to shared Kubernetes cluster",
  "status": "current",
  "authority_role": "infra_lead",
  "source": "trace://act_1043/feedback"
}
```

When the agent encounters the instance during its next cleanup sweep, that constraint now needs to find its way back
into the agent's context before it acts on the instance.

## 5. Finding the Right Context: Progressive Recall and Hybrid Search

Retrieval is where many memory architectures quietly fall apart. It is easy to assume that when a session starts, the
runtime already has a neat dictionary of metadata naming the exact workflow, target environment, and affected resources
upfront.

In a real production agent, you rarely have that luxury at request time. When a user sends a message or a webhook
triggers a run, the runtime initially knows only three things:

1. **Caller & Agent Identity:** From authentication and the session entry point, the runtime knows who is calling
   (`user_id`, `org_id`, roles) and which agent is running (`agent_id`). These identities establish the authorized
   storage scope, ensuring memories from one tenant or workspace aren't exposed to another.
2. **The Raw Prompt:** A short, often vague request from the user, such as *"Run the weekly staging cost cleanup"*,
   *"Why is my refund still pending?"*, or *"Fix the flaky auth test."*
3. **Live Conversation State:** Whatever messages or tool outputs have accumulated in the current session so far, which
   is empty on Turn 1.

Notice what is *not* known at request time: the runtime does not yet know which specific servers are idle
(`gpu-bench-01`), which refund transaction failed (`tx_992`), or which file contains the flaky test. Those entities only
surface **after** the agent starts running tools.

### Progressive Recall: Building Context Across Turns

Because the agent discovers what it is working on step by step, memory retrieval cannot be a single search executed once
before Turn 1. Instead, `recall()` runs at the start of every turn, using a `turn_context` that gets richer as the agent
interacts with the environment:

```text
REQUEST ARRIVES
  Known upfront: Caller Identity (org_id, user_id, role) + Raw Prompt
                                  |
                                  v
TURN 1: Initial Recall (Prompt-Driven)
  |-- Known Context : scope={workspace: staging-cloud}, active_entities=[]
  |-- Search Input  : "Run the weekly staging cost cleanup"
  |-- What Matches  : Playbooks/procedures & memories matching prompt intent
  +-- Agent Action  : Calls list_idle_instances("staging-cloud")
                                  |
          Tool returns resources: ["dev-sandbox-04", "gpu-bench-01"]
          Runtime resolves canonical entity IDs
          and adds them to turn_context.active_entities
                                  |
                                  v
TURN 2: Enriched Recall (Entity-Driven)
  |-- Known Context : Authorized scope + discovered entity IDs
  |-- Search Input  : Prompt + newly discovered active_entities
  |-- What Matches  : Active rule for cloud-instance:i-09a8f
  |                   Relevant cleanup & recovery episodes
  +-- Agent Action  : Stops dev-sandbox-04; leaves gpu-bench-01 running
```

Here is how the runtime updates `turn_context` after each tool execution so the next turn can query against newly
discovered resources:

```python
def update_turn_context(turn_context, action, tool_result):
    # 1. Keep the live tool observation for the current prompt window
    turn_context.live_observations.append(tool_result.summary)

    # 2. Extract entity IDs from structured tool args/outputs (e.g. resource IDs, service names)
    discovered_ids = extract_entity_ids(action.args, tool_result.structured_data)
    for entity_id in discovered_ids:
        if entity_id not in turn_context.active_entities:
            turn_context.active_entities.append(entity_id)
```

### Why Vector Search Alone Isn't Enough: 3-Way Hybrid Retrieval

With the authorized scope, request text, and discovered entities available, how does it actually search the memory
store?

Relying purely on vector embeddings creates three blind spots in production:

1. **Embeddings blur exact identifiers:** Dense vectors are great at matching fuzzy concepts (*"cut cloud spend"*
   $\approx$ *"cost cleanup"*), but they frequently miss exact resource names, error codes, or environment tags like
   `gpu-bench-01`, `staging-cloud`, or `ERR_RATE_LIMIT`.
2. **Similarity ignores validity:** A rule that was superseded three weeks ago has the exact same cosine similarity to a
   query as the rule that replaced it today.
3. **Similarity doesn't reflect operational priority:** A loosely related incident might score higher than an active
   restriction that must be considered before taking action. Retrieval needs to account for applicability and
   importance, not just semantic relevance.

Memory engines and hybrid search systems address these problems by combining metadata pre-filtering with complementary
search signals: semantic vector search, keyword matching (BM25), and exact entity lookup.

```text
+-----------------------------------------------------------------------+
| recall(principal, scope, query_text, active_entities)                 |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
| 1. HARD BOUNDARY & LIFECYCLE PRE-FILTER (Storage Layer)               |
|  - Access Boundary : Authorized tenants, users & workspaces           |
|  - Active Rules    : Current semantic facts and procedures            |
|  - Past Experience : Completed, failed & unresolved episodes          |
+-----------------------------------------------------------------------+
            |                         |                         |
            v                         v                         v
+-------------------+     +-------------------+     +-------------------+
| 2a. SEMANTIC      |     | 2b. KEYWORD /     |     | 2c. EXACT ENTITY  |
| VECTOR SEARCH     |     | BM25 SEARCH       |     | LOOKUP            |
|                   |     |                   |     |                   |
| Matches intent &  |     | Matches exact     |     | Matches records   |
| workflow meaning  |     | terms in prompt   |     | tagged with IDs   |
| ("cost cleanup")  |     | ("staging-cloud") |     | in active_entities|
+-------------------+     +-------------------+     +-------------------+
            |                         |                         |
            +-------------------------+-------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------+
| 3. FUSION, PRIORITY RANKING & TOKEN BUDGETING                         |
|  - Merge results (e.g., Reciprocal Rank Fusion + priority rules)      |
|  - Prioritize applicable entity constraints & matched procedures      |
|  - Include useful supporting episodes                                 |
|  - Trim to fit token budget (e.g., 800 tokens)                        |
+-----------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------+
| 4. WORKING MEMORY                                                     |
|  - User request + live observations + relevant memories               |
+-----------------------------------------------------------------------+
```

Hard pre-filtering restricts retrieval to memories the caller is authorized to access and prevents superseded or
unverified facts from showing up as active instructions. Episodes are filtered differently: a completed activity still
holds valuable history even when its outcome later required a rollback.

Within that authorized slice, vector search matches the intent of the request, BM25 catches exact terms like environment
tags and error codes, and exact entity lookup directly pulls facts and episodes indexed under the canonical resource IDs
in `active_entities`. The results are then deduplicated and ranked, giving applicable entity constraints priority over
supporting history. Token budgeting should trim lower-priority memories first, without silently dropping restrictions
that may govern the next action. If those constraints cannot fit, the runtime needs to narrow the context or defer the
decision.

### Putting Hybrid Recall Together

Here is how `recall()` brings those three search paths together in code:

```python
def recall(
    principal: UserPrincipal,
    scope: dict,
    query_text: str,
    active_entities: list[str],
    token_budget: int = 800,
) -> list[dict]:
    # 1. Resolve authorized scopes
    allowed_scopes = resolve_authorized_scopes(principal, requested_scope=scope)

    # 2. Vector + BM25 search, filtered by memory type and state
    text_matches = memory_store.hybrid_search(
        query_text=query_text,
        scopes=allowed_scopes,
        pre_filter={
            "fact": ["current"],
            "episode": ["completed", "failed", "unresolved"],
        },
        top_k=10,
    )

    # 3. Exact lookup for resources discovered so far
    entity_facts = memory_store.find_facts(
        scopes=allowed_scopes,
        entities=active_entities,
        status="current",
    )

    entity_episodes = memory_store.find_episodes(
        scopes=allowed_scopes,
        entities=active_entities,
        limit=5,
    )

    # 4. Merge, prioritize and fit into the context budget
    candidates = merge_and_deduplicate(
        text_matches, entity_facts, entity_episodes,
    )

    ranked = rank_memories(
        candidates,
        prioritize_entity_constraints=True,
    )

    return pack_into_token_budget(
        ranked,
        max_tokens=token_budget,
    )
```

The important part is that entity-specific recall happens after resource discovery but before the agent decides what to
do with those resources. That timing allows a constraint established in an earlier session to influence the current
decision, even when the original request never mentioned the affected resource.

## 6. Putting It Together: Working Memory and Procedural Playbooks

Once recall returns the relevant memories, the runtime still needs to combine them with the current task and live
execution context before calling the model. This assembled view is the agent's working memory: the information available
to it when making its next decision.

### Assembling Working Memory

When building the prompt view for a turn, the runtime pulls from three sources:

1. **Live Observations:** Outputs from tools executed during the current session, such as CPU utilization or resource
   status.
2. **Retrieved Long-Term Memories:** The ranked semantic facts, past episodes, and procedures returned by `recall()`.
3. **Recent Session Context:** Messages, feedback, and other events from the active session that haven't yet been
   consolidated into long-term memory.

Recent session context bridges the delay introduced by asynchronous consolidation. If a user corrects the agent and
immediately continues the conversation, that feedback can influence the next decision without waiting for a semantic
fact to be extracted. This covers continuity within the active session; a new session started before consolidation
finishes may still miss the correction. For critical updates, the runtime may need to read recent events directly or
persist the constraint synchronously.

```text
+------------------------+  +--------------------------+  +-------------------------+
| Live Turn Observations |  | Recent Session Context   |  | Recalled Store Memories |
| (Current tool outputs) |  | (Messages & feedback)    |  | (Facts, Procedures,     |
+------------------------+  +--------------------------+  |  Past Episodes)         |
            |                            |                +-------------------------+
            +----------------------------+-----------------------------+
                                         |
                                         v
             +-------------------------------------------------------+
             | assemble_working_context(token_budget=2000)           |
             |  - Group by record type (Rules, Playbooks, History)   |
             |  - Format retrieved content as delimited data blocks  |
             |  - Preserve source references & validity conditions   |
             +-------------------------------------------------------+
                                         |
                                         v
             +-------------------------------------------------------+
             | Assembled Working Memory (Sent to LLM)                |
             +-------------------------------------------------------+
```

Here is how the runtime builds that view in code

```python
def assemble_working_context(
    task: Task,
    observations: list[str],
    memories: list[dict],
    session_context: list[str],
    token_budget: int = 2000,
) -> str:
    # Group recalled memories by type
    facts = [m for m in memories if m["kind"] == "fact"]
    procedures = [m for m in memories if m["kind"] == "procedure"]
    episodes = [m for m in memories if m["kind"] == "episode"]

    # Assemble the context for the next model call
    sections = [
        render_task_block(task.message),
        render_procedures_block(procedures),
        render_facts_block(facts),
        render_episodes_block(episodes),
        render_recent_context_block(session_context),
        render_live_observations_block(observations),
    ]

    return fit_sections_to_budget(
        sections,
        max_tokens=token_budget,
    )
```

To see what the assembled context might look like, imagine a subsequent cleanup run after the revised playbook has been
approved. The agent has discovered the staging instances and collected their current metrics. Its working memory now
contains:

```text
CURRENT TASK
  Run the weekly staging cost cleanup in staging-cloud.

ACTIVE PROCEDURE (cleanup_idle_compute v2)
  1. Inspect live utilization metrics across staging instances.
  2. Check active constraints and scheduled batch workloads before stopping hosts.
  3. Verify whether conditional exemptions have expired.

ACTIVE SEMANTIC CONSTRAINTS (Retrieved Data)
  - gpu-bench-01 [lifecycle_policy]
    Keep running for Friday-night QA regression benchmarks.
    Ends when: QA migrates its suite to the shared Kubernetes cluster.
    Status: current | Authority: infra_lead
    Source: trace://act_1043/feedback

RELEVANT PAST EPISODES (Retrieved Data)
  - [ep_act_1043 | completed]
    Restarted gpu-bench-01 after the engineer reported that
    the earlier shutdown broke QA's regression suite.
    Source: trace://act_1043/feedback

  - [ep_act_1042 | completed]
    Stopped gpu-bench-01 after observing 0.2% average CPU
    utilization over 72 hours.
    Source: trace://act_1042/stop

LIVE OBSERVATIONS (Current Turn)
  - dev-sandbox-04: 0% utilization over 14 days.
  - gpu-bench-01: Near-zero utilization, currently running.
```

Instead of feeding the model an entire conversation transcript or replaying the raw event log, the runtime hands it a
compact, task-specific view: live metrics describe the current resource state, the semantic fact carries the standing
restriction, the episodes explain how that restriction came about, and the procedure lays out the workflow for
evaluating each host.

### Treating Procedural Playbooks Like Versioned Code

Look at `ACTIVE PROCEDURE (cleanup_idle_compute v2)` in the assembled prompt. While episodes track what happened during
a specific attempt and semantic facts hold knowledge about particular resources, procedural memory captures how the
agent should execute a class of tasks.

A procedure record stays simple and structured:

* `procedure_id`, `version`: Identifier and version, such as `cleanup_idle_compute` and `v2`.
* `scope`: Where the playbook applies, from a shared agent workflow to a particular organization or environment.
* `trigger_intent`: Description of the task the procedure governs, indexed for retrieval.
* `steps`: Ordered instructions and verification checks the agent should follow.
* `status`, `approved_by`: Lifecycle state (`current`, `draft`, or `deprecated`) and the owner who approved the
  procedure.

Procedures usually start as playbooks written by engineers. Over time, repeated episodes often expose a pattern that
wasn't obvious when the playbook was first drafted. If the original cleanup procedure only checked 48- or 72-hour CPU
utilization before stopping an instance, repeated incidents with weekend batch jobs would reveal a workflow gap. That
lesson shouldn't stay buried inside individual server histories; it belongs in the cleanup playbook so future runs check
batch schedules and active exemptions across every host.

```text
+-------------------------------------+
| 1. EXISTING PROCEDURE (v1)          |
|    Identify and stop idle staging   |
|    compute instances                |
+-------------------------------------+
                   |
                   v
+-------------------------------------+
| 2. EPISODES / LESSONS LEARNED       |
|    Scheduled workloads overlooked   |
|    during resource cleanup          |
+-------------------------------------+
                   |
                   v
+-------------------------------------+
| 3. CANDIDATE PROCEDURE UPDATE       |
|    Check weekly batch schedules     |
|    and active resource exemptions   |
|    before stopping an instance      |
+-------------------------------------+
                   |
                   v
          Human Review & Approval
                   |
                   v
+-------------------------------------+
| 4. PUBLISHED PROCEDURE (v2)         |
|    Approved and marked current      |
+-------------------------------------+
```

This is where procedural memory differs from ordinary fact extraction. A background worker can safely record a
resource-specific constraint from authorized feedback, but automatically rewriting a shared operational playbook is a
much bigger risk. If an LLM promotes a noisy workaround or a misunderstood ticket comment into a shared procedure, a
mistake that originally affected one resource could suddenly influence every execution across hundreds of environments.
Playbook updates should be proposed offline from recurring episodes, reviewed by humans, and versioned just like
application code so you can roll them back if a new version causes problems.

There is one more detail worth noting in the assembled context: the labels marking semantic facts and episodes as
`(Retrieved Data)`. Stored memories often contain text originally supplied by users, external tools, or ticket comments.
Labeling recalled records as data rather than system instructions helps defend against delayed prompt injection—while
permissions, scope boundaries, and tool authorization remain strictly enforced by the application runtime.

## 7. The Payoff: Evaluating Memory on Decisions, Not Search Scores

Equipped with the assembled working context, here is how `CostGuard` handles the next cleanup run:

> "I found two idle instances in `staging-cloud`. `dev-sandbox-04` has been idle for 14 days and has no active
> restrictions or scheduled workloads, so I'm stopping it. I'm leaving `gpu-bench-01` running despite its low
> utilization. The previous shutdown broke QA's regression suite, and there's still an active restriction protecting the
> instance until that workload moves to Kubernetes."

Both instances look idle, but only one is safe to stop. That's the behavior we want to test—not merely whether the
memory system retrieved the right records.

### Measuring Whether Your Memory Architecture Works

When teams evaluate agent memory, they often treat it like a standard search problem, measuring `recall@k` or cosine
similarity on static question-answering benchmarks. Benchmarks like LongMemEval are helpful for testing retrieval and
reasoning over long histories, but search scores alone won't tell you whether your runtime actually prevents bad
production actions.

What matters in production is whether the agent can discover a resource mid-task, retrieve its active constraint, keep
that constraint intact when irrelevant observations arrive, and let it go once its end condition is verified. Rather
than testing isolated retrieval queries, build a small set of multi-session scenarios that test the agent's end-to-end
decisions:

| Test Scenario                                | Expected Behavior                                              |
| -------------------------------------------- | -------------------------------------------------------------- |
| Vague cleanup request                        | Discover the entity and retrieve its active restrictions       |
| New idle metrics despite an active exemption | Preserve the restriction; don't stop the instance              |
| Unverified comment suggests shutdown         | Don't override an authorized instruction                       |
| Migration completion is verified             | Retire the exemption; evaluate under the normal cleanup policy |
| Request crosses an access boundary           | Never expose memories from unauthorized scopes                 |

Run the same scenarios against four configurations: no cross-session memory, raw-log RAG, episodic memory only, and the
full pipeline with semantic facts and reconciliation. Keep the model, tools, and approved procedures consistent across
configurations so improvements can be attributed to memory rather than changes elsewhere in the agent.

Alongside decision accuracy, track operational metrics that search benchmarks miss: how often the agent attempts a
prohibited action, how often it incorrectly blocks a valid one, whether it relies on superseded information, and how
much latency memory retrieval adds to each turn.

### Start Simple, Add Layers as Failures Justify Them

You do not need to build every piece of this architecture on day one. If your agent runs single-session tasks with a
small set of tools, a clean event log and a versioned playbook file will get you surprisingly far.

As your agent takes on longer, multi-session workflows, you can roll out the architecture in four steps:

1. **Instrument the runtime loop:** Capture structured execution events and human feedback, and trigger recall as new
   entities become available.
2. **Consolidate useful episodes:** Group related events at meaningful checkpoints, preserving the outcomes and evidence
   worth recalling.
3. **Maintain semantic knowledge:** Extract standing rules, verify their authority, and reconcile new evidence against
   existing constraints.
4. **Evolve shared procedures:** Use recurring lessons to propose playbook improvements, with human approval and version
   control.

There is no universal threshold where an agent suddenly needs all four memory layers. A personal assistant remembering
user preferences has different requirements from an infrastructure agent modifying production resources. Start with the
smallest memory layer that solves a real failure mode, and add structure as your agent's responsibilities grow.

A useful memory system doesn't just help an agent remember what happened. It helps the agent distinguish what still
matters from what has changed, apply that knowledge to the next decision, and trace its reasoning back to the evidence
that informed it.