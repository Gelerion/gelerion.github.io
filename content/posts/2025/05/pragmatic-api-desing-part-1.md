---
title: "Pragmatic API Design: Balancing Best Practices and Real-World Needs (Part 1)"
date: 2025-05-05T08:00:00+03:00
lastmod: 2025-05-05T08:00:00+03:00
author: "Gelerion"
series: ["Pragmatic API Design"]
draft: false
categories: ["API Design", "Software Engineering"]
summary: "Explore pragmatic API design principles in Part 1 of this series. Learn to balance REST best practices with real-world requirements, covering resource modeling, URL design, PUT vs. PATCH for updates, and handling business actions effectively."
description: "Explore pragmatic API design principles in Part 1 of this series. Learn to balance REST best practices with real-world requirements, covering resource modeling, URL design, PUT vs. PATCH for updates, and handling business actions effectively."
tags: [
    "API",
    "REST",
    "API Design",
    "PUT vs PATCH",
]
keywords: [
    "API design",
    "pragmatic API",
    "REST API",
    "RESTful",
    "backend development",
    "software engineering",
    "HTTP methods",
    "PUT vs PATCH",
    "resource modeling",
    "URL design",
    "API best practices"
]
toc: true
---

## Introduction

Collaboration is central to modern software engineering, and APIs are the critical interfaces that enable it –
connecting frontends to backends, services to services, and businesses to partners. Designing an API often starts with
familiar guidelines: model resources, use HTTP methods consistently, and keep URLs predictable. But things get more
interesting when those guidelines meet real-world requirements.

Should updating an account use `PUT` or `PATCH`? Is canceling an order just another status update, or should it have its
own endpoint? Both questions seem straightforward until you start considering client expectations, business rules, and
how the API might evolve.

Over the years, I've seen teams approach these decisions from opposite directions. Some follow REST conventions so
rigidly that their APIs become awkward to use. Others prioritize immediate needs and end up with inconsistent interfaces
that are difficult to maintain.

In this series, we'll use a simple e-commerce platform, FlexiShop, to explore these trade-offs. Rather than treating
best practices as fixed rules, we'll look at why they exist, where they work well, and when a different approach makes
more sense.

## Guiding Principles for Pragmatic API Design

* **User-Centricity:** Design for the consumers of your API. Start with their use cases (user stories) and prioritize
  making their tasks easier and more intuitive. The API should serve their needs, not just expose internal structures.
* **Pragmatism over Dogma:** Standards and best practices (like REST) provide excellent guidelines, but don't follow
  them rigidly if it leads to an awkward or inefficient API for your specific context. Be willing to make practical
  trade-offs.
* **Simplicity and Clarity:** Strive for the simplest solution that meets the requirements. Use clear, descriptive names
  for resources and fields. Avoid unnecessary jargon or internal acronyms. Prefer explicit patterns over overly "clever"
  or implicit ones.
* **Consistency:** Once you choose a pattern (for naming, actions, errors, pagination, etc.), apply it consistently
  across your entire API surface. Predictability drastically reduces the learning curve for consumers.
* **Plan for Evolution:** APIs change. Design with future evolution in mind by implementing versioning from the start
  and favoring non-breaking changes whenever possible.

## REST Fundamentals: A Quick Refresher

* **Resource-Oriented:** Modeling our domain as resources (`/users`, `/orders`) provides a clear, understandable
  structure
* **Uniform Interface:** Using standard HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`), status codes, and media
  types (`application/json`) creates consistency and predictability. Clients understand how to interact with resources
  without prior knowledge of specific implementations.
* **Statelessness:** Each request contains all necessary information; the server doesn't store client session state
  between requests. This enhances scalability and reliability.

## Meet FlexiShop: Our Running Example

Let's imagine we're building an API for FlexiShop, a simple e-commerce platform. The product is still in its early
stages, and our task is to design an API that supports its initial requirements without making it unnecessarily
complicated or difficult to extend.

Our product team has come up with a handful of user stories:

* *"As a new user, I want to register an account so that I can place orders."*
* *"As a registered user, I want to modify my account details to keep my information up to date."*
* *"As a customer, I want to create an order so that I can purchase products."*
* *"As a customer, I want to view the status of my order."*
* *"As a customer, I want to cancel my order if it's not yet shipped."*

Nothing particularly unusual so far. These requirements seem straightforward, and familiar REST conventions should help
us get started. But as we'll discover, even a small set of requirements can lead to design choices that aren't quite as
obvious as they first appear. Let's see how we can turn these stories into a practical API.

## Foundational Design: From User Needs to APIs

With FlexiShop's initial requirements in hand, how do we begin shaping the API? The first step is to translate these
user stories into resources that make sense to our consumers, rather than simply exposing our internal data model.

### Start with User Stories to Identify Concepts

Look at the FlexiShop stories we listed: "Register an account," "Modify account details," "Create an order," "View order
status," "Cancel an order." These immediately point to the core domain objects our API must handle: likely an `Account`
resource and an `Order` resource.

The verbs within these stories (`Register`, `Modify`, `Create`, `View`, `Cancel`) also highlight the primary actions the
API needs to support. Also, the stories often hint at relationships between resources (e.g., an Order connects to an
Account, even if not explicitly stated).

This user-story-driven approach ensures our API directly addresses the required functionality, moving away from the
common mistake of simply exposing database tables.

### Model Concepts, Not Internals (Abstraction)

Next, define the shape of these resources based on the domain concept, acting as a contract with the consumer. What does
an `Order` mean to a FlexiShop customer or frontend? It likely involves an `id`, `status`, `items summary`, and
`total cost`. Crucially, it should **not** expose internal database fields (like `order_table_shard_id`) or
implementation details. This abstraction shields consumers from internal complexity and allows the backend to evolve
more freely.

<details>
<summary>A Note on Hypermedia (HATEOAS)</summary>

REST also introduces the concept of including links to available actions within resource representations. For example,
an Order response might include a link to cancel the order. While this can improve discoverability, it also adds
complexity for both servers and clients. For FlexiShop, we'll stick with predictable, documented URLs unless there's a
compelling reason to introduce hypermedia.

</details>

### Keep It Minimal

Minimalism is a core tenet of pragmatic design, applying equally to both the functionality your API offers and the data
it exposes.

* **Minimize Functionality:** Start by implementing only the endpoints and operations strictly necessary to fulfill the
  current, well-defined user stories or requirements. Don't build endpoints for features that *might* be needed someday.
* **Minimize Data Exposure:** Within the resources supporting this essential functionality, include only the fields
  required for those specific use cases. For the `Account` resource supporting registration and updates, fields like
  `email`, `name`, and `password` (for input only, never output!) are necessary. Resist adding fields for future
  possibilities ("Maybe users will want profile pictures later?").

> 💡 **Remember!** Complexity costs – in development, testing, documentation, and maintenance.

## Designing Clean URLs: Structure and Naming Matter

With resources conceptually defined, we need to determine their addresses – the URL structure. How we structure these
URLs significantly impacts usability and maintainability.

### URL Formatting: Use Kebab-Case

Consistency starts with the basics. For URL path segments, adopt a simple, standard convention: use only lowercase
letters and hyphens (`-`, kebab-case) to separate words.

* Do: `/order-items`, `/shipping-addresses`, `/product-reviews`
* Don't: `/OrderItems`, `/orderItems`, `/shipping_addresses`, etc.

(Note: Path parameters like `{productId}` or `{wishlistId}` often use camelCase for programming language compatibility,
which is an acceptable distinction).

**Rationale:** `kebab-case` is URL-safe, highly readable (hyphens remain visible when underlined), and a common web
standard. This simple choice eliminates ambiguity and improves developer experience.

### Resource Relationships

How should we structure URLs for related resources? It's tempting to mirror database relationships, but this can quickly
lead to deeply nested paths:

`/accounts/{accountId}/orders/{orderId}/items/{itemId}`

Deep nesting introduces several problems:

* **Harder to navigate:** URLs become longer and more cumbersome.
* **Tighter coupling:** Changes to resource relationships may affect existing clients.
* **Unnecessary dependencies:** Clients may need to know the entire resource hierarchy just to access a single item.

Consider FlexiShop's `Order` resource. Although every order belongs to an account, do we really need the account id
every time we retrieve an order?

Probably not. If orders have unique identifiers, `/orders/{orderId}` is simpler and gives clients direct access to the
resource.

However, `/accounts/{accountId}/orders` could still make sense when listing orders belonging to a particular account.

#### Pragmatic Recommendation

Keep URLs shallow unless the parent-child relationship is meaningful to the operation. One level of nesting is often
enough, but it shouldn't be a hard rule.

The goal isn't to eliminate nesting. It's to avoid making consumers navigate relationships they don't actually need.

## Mapping User Stories to FlexiShop Endpoints

Let's translate our principles and the FlexiShop user stories into an initial API structure. As discussed, we start by
identifying core concepts and actions directly from the user needs:

* Stories like `Register an account`, `Create an order`, `View the status of my order` clearly point to `Account` and
  `Order` concepts.
* The verbs (`Register`, `Create`, `View`) suggest the required actions.

Following standard REST practices and our guidelines (minimalism, resource-orientation, clear URLs), the most
straightforward mappings for these initial stories are:

* Register Account: `POST /v1/accounts`
* Create Order: `POST /v1/orders`
* View Order Status: `GET /v1/orders/{orderId}`

These endpoints provide the basic capabilities derived directly from user needs.

## Encountering the First Design Dilemmas

But what about our remaining two user stories?

* **Updating Account Details:** Customers need to modify their account information, but should we use `PUT` or `PATCH`?
  Should clients send the entire account representation or only the fields they want to change?
* **Canceling an Order:** Should cancellation be a simple status update, such as `PATCH /v1/orders/{orderId}` with
  `{"status": "canceled"}`, or an explicit operation like `POST /v1/orders/{orderId}/cancel`?

Both approaches might work, but the choice affects how consumers interact with our API and how easily we can evolve it.
Let's look at the trade-offs before deciding.

## Resolving the Design Dilemmas

Let's work through the two questions we left open, where REST convention and practical needs pull in different
directions.

### Handling Resource Updates (PUT vs. PATCH)

> **The Conflict:** How should clients update an existing resource? REST offers two methods, `PUT` and `PATCH`, with
> distinct semantics that often cause confusion.

#### Option 1: Full Replacement with `PUT`

Requires the client to send the **entire, complete** representation of the resource as it should exist after the update.
If a client omits a field, the server typically interprets this as an intent to nullify or remove that field. `PUT`
requests are expected to be idempotent.

#### Option 2: Partial Update with `PATCH`

Designed for **partial updates**. The client sends only the fields they intend to change. This is often more
network-efficient and safer, as it avoids accidental data loss for fields the client didn't intend to modify. To apply
partial updates, servers need defined formats. Common standards include:

* `application/merge-patch+json` ([RFC 7396](https://datatracker.ietf.org/doc/html/rfc7396)): Simple. The patch body is
  a JSON object mirroring the resource structure; included fields replace existing values, explicitly null values
  typically remove/nullify fields.
* `application/json-patch+json` ([RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902)): More powerful/complex. Uses
  a JSON array of explicit operations (add, remove, replace, etc.) for fine-grained control.

#### Pragmatic Recommendation

For most scenarios involving partial updates, prefer `PATCH` with `application/merge-patch+json` for its simplicity and
safety against accidental data removal. It directly reflects the common intent of "change these specific fields."
Reserve `PUT` for cases where replacing the entire resource state makes semantic sense (like uploading a file or
replacing a complete configuration). Only use `application/json-patch+json` if the granular control operations are truly
necessary.

<details>
<summary>FlexiShop Illustration: Updating Account Details</summary>

Our story "As a registered user, I want to modify my account details..." clearly implies a partial update. `PATCH` is
the better fit:

```http
PATCH /v1/accounts/acc_123xyz HTTP/1.1
Host: flexishop.com
Authorization: Bearer <token>
Content-Type: application/merge-patch+json

{
  "phone_number": "+1-555-123-9876",
  "shipping_address": {
    "street_address": "789 New Parkway",
    "city": "Updatedville",
    "region": "CA",
    "postal_code": "90211",
    "country": "US"
  }
}
```

The server applies only these changes, leaving other fields like `email` untouched, which aligns perfectly with the
user's intent.

</details>

### Modeling Business Actions

> **The Conflict:** How do we represent operations that go beyond simple CRUD? Real-world applications involve commands,
> processes, and complex business logic (e.g., cancel, approve, publish, submit) that don't always map cleanly to
> modifying resource state alone.

#### Option 1: Implicit Action via State Change

One approach attempts to stay strictly within REST's resource-centric model by triggering actions through state changes,
typically using `PATCH`. For example, canceling an order might be attempted via `PATCH /v1/orders/{orderId}` with a body
like `{ "status": "canceled" }`.

**Critique:** While theoretically pure for simple status changes, this often obscures intent and complexity:

* **Hides Process:** The request doesn't explicitly invoke the "cancellation process" with its specific rules (e.g.,
  checking if shipped) and side effects (inventory adjustment, notifications).
* **Obscures Rules:** How does the client know if setting the status to `canceled` is allowed or what conditions apply?
* **Unclear Side Effects:** The client isn't explicitly told what other actions might occur.
* **Implementation Burden:** The server's `PATCH` handler becomes complex, needing to differentiate simple state updates
  from action triggers.

#### Option 2: Explicit Action Endpoints

A more pragmatic approach uses endpoints that explicitly represent the action, often using `POST` on a nested URL
segment. Common conventions include:

* `POST /resource/{id}/action` (e.g., `/orders/{orderId}/cancel`)
* `POST /resource/{id}:action` (e.g., `/orders/{orderId}:cancel`, used by Google APIs)

**Critique:**

* **Against REST URL Conventions:** It introduces verb-like segments into URLs, deviating from strict REST
  resource/noun-centric principles.
* **Increases Number of Endpoints:** Each distinct action requires its own endpoint, potentially increasing the total
  number of API endpoints.

#### Pragmatic Recommendation

Despite the valid critiques of Option 2, favor **explicit action endpoints** (like `POST /resource/{id}/action`) for
modeling complex business operations or commands. The significant gains in expressing clear intent, encapsulating
complex business logic and side effects, and providing a distinct contract for the action typically outweigh the
theoretical purity concerns or the manageable increase in the number of endpoints. Reserve `PATCH` for its primary
purpose: efficient and clear partial state modification of a resource's data fields.

<details>
<summary>FlexiShop Illustration: Cancelling an Order</summary>

Our story – *"As a customer, I want to cancel my order if it's not yet shipped"* – involves business logic and rules. An
explicit action is clearer:

```http
POST /v1/orders/ord_456abc/cancel HTTP/1.1
Host: flexishop.com
Authorization: Bearer <token>

{
  "cancellation_reason": "Accidental order."
}
```

**Why this is better:**

* **Clear Intent:** Explicitly invokes the cancellation process.
* **Encapsulates Logic:** Allows the backend handler to focus solely on cancellation rules (*Is it shipped? Adjust
  inventory? Send notifications?*).
* **Clearer Contract:** The endpoint signals the operation. The request body (optional) can carry action-specific
  parameters. The response clearly confirms success or failure of the action (e.g., `409 Conflict` if already shipped,
  `200 OK` or `204 No Content` on success).

</details>

## Putting It Together: The First FlexiShop Endpoints

We've worked through FlexiShop's initial requirements, made our resource modeling decisions, and tackled a couple of
design dilemmas along the way.

Let's bring those decisions together. Here's what our first API looks like:

| HTTP Method | Path | Purpose / User Story Addressed |
|---|---|---|
| POST | `/v1/accounts` | Register a new user account |
| PATCH | `/v1/accounts/{accountId}` | Modify existing account details (partial update) |
| POST | `/v1/orders` | Create a new order |
| GET | `/v1/orders/{orderId}` | View the details and status of a specific order |
| POST | `/v1/orders/{orderId}/cancel` | Initiate the process to cancel an existing order |

These five endpoints cover our initial user stories without introducing functionality we don't yet need. We have a
starting point for FlexiShop's API, shaped by customer requirements rather than REST conventions alone.

Of course, this is only the beginning. As FlexiShop grows, new requirements will bring new design challenges,
particularly when we move beyond individual resources to collections, larger datasets, and production concerns.

## Conclusion

We started with five fairly straightforward user stories for FlexiShop. Yet even these simple requirements led us to
decisions where following REST conventions alone wasn't enough.

We chose PATCH for partial account updates, introduced an explicit endpoint for order cancellation, and kept our
resource model focused on what consumers actually need.

That's what pragmatic API design comes down to: understanding the conventions, but also knowing when and why to adapt
them. The goal isn't to build the most RESTful API possible, but one that's intuitive, consistent, and practical to work
with.

Of course, we've only scratched the surface. So far, FlexiShop handles individual resources and a few basic operations.
As the platform grows, we'll need to deal with collections, larger datasets, and the challenges of running an API in
production.

### Coming Up Next

1. **Part 2: Mastering Collections:** We'll explore how FlexiShop can efficiently return lists of products and orders,
   covering filtering strategies, pagination, and consistent sorting.
2. **Part 3: Ensuring Robustness and Evolution:** We'll move into production concerns, including API versioning, rate
   limiting, idempotency for safe retries, and asynchronous operations.

Stay tuned as we continue building the FlexiShop API using these pragmatic principles.
