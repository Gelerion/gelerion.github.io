---
title: "Pragmatic API Design: Balancing Best Practices and Real-World Needs (Part 1)"
date: 2025-05-05T08:00:00+03:00
lastmod: 2025-05-05T08:00:00+03:00
author: "Gelerion"
series: ["Pragmatic API Design"] 
draft: false 
categories: ["API Design", "Software Engineering"]
summary: "Explore pragmatic API design principles in Part 1 of this series. Learn to balance REST best practices with real-world requirements, covering resource modeling, URL design, PUT vs. PATCH for updates, and handling business actions effectively"
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
# Intorduction

Collaboration is central to modern software engineering, and APIs are the critical interfaces that enable it – connecting frontends to backends, services to services, and businesses to partners. Crafting truly effective APIs—intuitive, flexible, and robust—isn't just about following rules blindly; it requires a pragmatic approach, carefully balancing established best practices with the practical needs of your consumers and evolving systems.

In my years designing and building software across various domains, I've seen teams struggle with this balance. Some adhere so rigidly to dogma that their APIs become awkward and difficult to use. Others ignore standards, resulting in inconsistent, unpredictable interfaces that frustrate developers. The art lies in understanding the *why* behind the guidelines and applying them judiciously to create APIs that are genuinely useful and maintainable.

In this guide, I'll share insights and practical techniques for pragmatic API design, using a running example to make the concepts concrete and actionable.

## Guiding Principles for Pragmatic API Design

* **User-Centricity:** Design for the consumers of your API. Start with their use cases (user stories) and prioritize making their tasks easier and more intuitive. The API should serve their needs, not just expose internal structures.
* **Pragmatism over Dogma:** Standards and best practices (like REST) provide excellent guidelines, but don't follow them rigidly if it leads to an awkward or inefficient API for your specific context. Be willing to make practical trade-offs.
* **Simplicity and Clarity:** Strive for the simplest solution that meets the requirements. Use clear, descriptive names for resources and fields. Avoid unnecessary jargon or internal acronyms. Prefer explicit patterns over overly "clever" or implicit ones.
* **Consistency:** Once you choose a pattern (for naming, actions, errors, pagination, etc.), apply it consistently across your entire API surface. Predictability drastically reduces the learning curve for consumers.
* **Plan for Evolution:** APIs change. Design with future evolution in mind by implementing versioning from the start and favoring non-breaking changes whenever possible.

## REST Fundamentals: A Quick Refresher

* **Resource-Oriented:** Modeling our domain as resources (`/users`, `/orders`) provides a clear, understandable structure
* **Uniform Interface:** Using standard HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`), status codes, and media types (`application/json`) creates consistency and predictability. Clients understand how to interact with resources without prior knowledge of specific implementations.
* **Statelessness:** Each request contains all necessary information; the server doesn't store client session state between requests. This enhances scalability and reliability.

## Meet FlexiShop: Our Running Example

To illustrate these pragmatic design choices, we'll imagine we're building the API for FlexiShop, a straightforward e-commerce platform. As we discuss principles and patterns, we'll refer back to FlexiShop's evolving API needs.

Let's start with some initial, core user stories driving our initial design:

*  *"As a new user, I want to register an account so that I can place orders."*
*  *"As a registered user, I want to modify my account details to keep my information up to date."*
*  *"As a customer, I want to create an order so that I can purchase products."*
*  *"As a customer, I want to view the status of my order."*
*  *"As a customer, I want to cancel my order if it's not yet shipped."*

These simple stories will be our foundation as we apply design principles.

## Foundational Design: From User Needs to APIs

With our principles and initial FlexiShop user stories in mind, how do we begin shaping the API? The foundation lies in translating user needs into well-defined resources, focusing on external usability rather than internal structure.

### Start with User Stories to Identify Concepts

Look at the FlexiShop stories we listed: "Register an account," "Modify account details," "Create an order," "View order status," "Cancel an order." These immediately point to the core domain objects our API must handle: likely an `Account` resource and an `Order` resource.

The verbs within these stories (`Register`,`Modify`,`Create`,`View`,`Cancel`) also highlight the primary actions the API needs to support. Also, the stories often hint at relationships between resources (e.g., an Order connects to an Account, even if not explicitly stated).

This user-story-driven approach ensures our API directly addresses the required functionality, moving away from the common mistake of simply exposing database tables.

### Model Concepts, Not Internals (Abstraction):

Next, define the shape of these resources based on the domain concept, acting as a contract with the consumer. What does an `Order` mean to a FlexiShop customer or frontend? It likely involves an `ID`, `status`, `items summary`, and `total cost`. Crucially, it should **not** expose internal database fields (like `order_table_shard_id`) or implementation details. This abstraction shields consumers from internal complexity and allows the backend to evolve more freely.
   
**A Note on Hypermedia (HATEOAS):**  
REST includes the concept of responses containing links for next actions (e.g., an `Order` linking to `/cancel`). While powerful, full HATEOAS adds significant complexity.  
**Recommendation:** While powerful for discoverability and decoupling clients from hardcoded URLs, full HATEOAS adds complexity to both server implementation and client consumption. Many successful pragmatic APIs use well-defined, documented URL structures instead of relying solely on discoverable links. Understand the principle, but apply it judiciously based on your needs and your clients' capabilities.

### Keep it Minimal

Minimalism is a core tenet of pragmatic design, applying equally to both the functionality your API offers and the data it exposes.

* **Minimize Functionality:** Start by implementing only the endpoints and operations strictly necessary to fulfill the current, well-defined user stories or requirements. Don't build endpoints for features that *might* be needed someday.
* **Minimize Data Exposure:** Within the resources supporting this essential functionality, include only the fields required for those specific use cases. For the `Account` resource supporting registration and updates, fields like `email`, `name`, and `password` (for input only, never output!) are necessary. Resist adding fields for future possibilities ("Maybe users will want profile pictures later?").

> 💡 **Remember!** Complexity costs – in development, testing, documentation, and maintenance.

## Designing Clean URLs: Structure and Naming Matters

With resources conceptually defined, we need to determine their addresses – the URL structure. How we structure these URLs significantly impacts usability and maintainability.

### URL Formatting: Use Kebab-Case

Consistency starts with the basics. For URL path segments, adopt a simple, standard convention: use only lowercase letters and hyphens (`-`, kebab-case) to separate words.

* Do: `/order-items`, `/shipping-addresses`, `/product-reviews`
* Don’t: `/OrderItems`, `/orderItems`, `/shipping_addresses`, etc.

(Note: Path parameters like `{productId}` or `{wishlistId}` often use camelCase for programming language compatibility, which is an acceptable distinction).

**Rationale:** `kebab-case` is URL-safe, highly readable (hyphens remain visible when underlined), and a common web standard. This simple choice eliminates ambiguity and improves developer experience.

### Resource Relationships

How should we structure URLs for related resources? It's tempting to mirror database relationships, but avoid deep nesting like `/users/{userId}/orders/{orderId}/items/{itemId}`.

**Why?** Deeply nested URLs are:

* Hard to read and parse.
* Brittle: Changes in relationships break clients tied to the structure.
* Difficult to maintain in routing logic.

&nbsp;   
#### Pragmatic Recommendation
Limit nesting depth. Often, one level is the practical maximum needed for clear parent-child relationships (e.g., `/orders/{orderId}/items`). For more complex relationships, consider query parameters or dedicated top-level resources.

## Mapping User Stories to FlexiShop Endpoints

Let's translate our principles and the FlexiShop user stories into an initial API structure. As discussed, we start by identifying core concepts and actions directly from the user needs:

* Stories like "Register an account," "Create an order," "View the status of my order" clearly point to `Account` and `Order` concepts.
* The verbs ("Register," "Create," "View") suggest the required actions.

Following standard REST practices and our guidelines (minimalism, resource-orientation, clear URLs), the most straightforward mappings for these initial stories are:

* Register Account: `POST /v1/accounts`
* Create Order: `POST /v1/orders`
* View Order Status: `GET /v1/orders/{orderId}`

These endpoints provide the basic capabilities derived directly from user needs.

### Encountering the First Design Dilemmas

However, as soon as we consider the remaining user stories, we encounter common design challenges. These aren't flaws in the principles but rather areas where pragmatic choices and trade-offs become critical:

* **Handling Updates:** The "Modify account details" story requires updating an existing `/v1/accounts/{accountId}`. This immediately raises the `PUT` vs. `PATCH` question: should clients send the full resource or only the changed fields? Each approach has implications we need to weigh.
* **Modeling Non-CRUD Actions:** The "Cancel my order" story isn't a simple CRUD. How do we represent this action on `/v1/orders/{orderId}`? Is it a `POST` to an action sub-resource (e.g., `/cancel`), a `PATCH` changing the status, or something else? Choosing the right pattern for business actions is key.

These scenarios immediately raise common design questions. Let's tackle two key ones: handling updates and modeling business actions.

## Tackling Common Design Dilemmas

Here are some recurring battlegrounds where theory meets the messy reality of software development.

### Handling Resource Updates (PUT vs. PATCH)

**The Conflict:** How should clients update an existing resource? REST offers two methods, `PUT` and `PATCH`, with distinct semantics that often cause confusion.

**Options:**

* **`PUT`:** Requires the client to send the **entire, complete** representation of the resource as it should exist after the update. If a client omits a field, the server typically interprets this as an intent to nullify or remove that field. `PUT` requests are expected to be idempotent.
* **`PATCH`:** Designed for **partial updates**. The client sends only the fields they intend to change. This is often more network-efficient and safer, as it avoids accidental data loss for fields the client didn't intend to modify. To apply partial updates, servers need defined formats. Common standards include:
    * `application/merge-patch+json` ([RFC 7396](https://datatracker.ietf.org/doc/html/rfc7396)): Simple. The patch body is a JSON object mirroring the resource structure; included fields replace existing values, explicitly null values typically remove/nullify fields.
    * `application/json-patch+json` ([RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902)): More powerful/complex. Uses a JSON array of explicit operations (add, remove, replace, etc.) for fine-grained control.
&nbsp;   
#### Pragmatic Recommendation
For most scenarios involving partial updates, prefer `PATCH` with `application/merge-patch+json` for its simplicity and safety against accidental data removal. It directly reflects the common intent of "change these specific fields." Reserve `PUT` for cases where replacing the entire resource state makes semantic sense (like uploading a file or replacing a complete configuration). Only use `application/json-patch+json` if the granular control operations are truly necessary.

**FlexiShop Illustration (Updating Account Details):** Our story "As a registered user, I want to modify my account details..." clearly implies a partial update. `PATCH` is the better fit:

```http
PATCH /v1/accounts/acc_123xyz HTTP/1.1
Host: flexishop.com
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

The server applies only these changes, leaving other fields like `email` untouched, which aligns perfectly with the user's intent.

### Modeling Business Actions

**The Conflict:** How do we represent operations that go beyond simple CRUD? Real-world applications involve commands, processes, and complex business logic (e.g., cancel, approve, publish, submit) that don't always map cleanly to modifying resource state alone.  

**Options:**

* **Implicit Action via State Change:** One approach attempts to stay strictly within REST's resource-centric model by triggering actions through state changes, typically using `PATCH`. For example, cancelling an order might be attempted via `PATCH /v1/orders/{orderId}` with a body like `{ "status": "cancelled" }`.
* **Critique of Option 1:** While theoretically pure for simple status changes, this often obscures intent and complexity:
    * *Hides Process:* The request doesn't explicitly invoke the "cancellation process" with its specific rules (e.g., checking if shipped) and side effects (inventory adjustment, notifications).
    * *Obscures Rules:* How does the client know if setting the status to cancelled is allowed or what conditions apply?
    * *Unclear Side Effects:* The client isn't explicitly told what other actions might occur.
    * *Implementation Burden:* The server's `PATCH` handler becomes complex, needing to differentiate simple state updates from action triggers.
   
&nbsp;     
* **Explicit Action Endpoints:** A more pragmatic approach uses endpoints that explicitly represent the action, often using `POST` on a nested URL segment. Common conventions include:
   * `POST /resource/{id}/action` (e.g., `/orders/{orderId}/cancel`)
   * `POST /resource/{id}:action` (e.g., `/orders/{orderId}:cancel` - used by Google APIs)
* **Critique of Option 2:**
    * *Against REST URL Conventions:* It introduces verb-like segments into URLs, deviating from strict REST resource/noun-centric principles.
    * *Increases Number of Endpoints:* Each distinct action requires its own endpoint, potentially increasing the total number of API endpoints.  

&nbsp;   
#### Pragmatic Recommendation
Despite the valid critiques of Option 2, favor explicit action endpoints (like `POST /resource/{id}/action`) for modeling complex business operations or commands. The significant gains in expressing clear intent, encapsulating complex business logic and side effects, and providing a distinct contract for the action typically outweigh the theoretical purity concerns or the manageable increase in the number of endpoints. Reserve `PATCH` for its primary purpose: efficient and clear partial state modification of a resource's data fields.

**FlexiShop Illustration (Cancelling an Order):** Our story "As a customer, I want to cancel my order if it's not yet shipped" involves business logic and rules. An explicit action is clearer:

```http
POST /v1/orders/ord_456abc/cancel HTTP/1.1
Host: flexishop.com
Authorization: Bearer <token>

{
  "cancellation_reason": "Accidental order."
}
```

Why this is better:

* **Clear Intent:** Explicitly invokes the cancellation process.
* **Encapsulates Logic:** Allows the backend handler to focus solely on cancellation rules (Is it shipped? Adjust inventory? Send notifications?).
* **Clearer Contract:** The endpoint signals the operation. The request body (optional) can carry action-specific parameters. The response clearly confirms success/failure of the action (e.g., `409 Conflict` if already shipped, `200 OK` or `204 No Content` on success).

## Putting it Together: The First FlexiShop Endpoints

Having addressed the initial design challenges – specifically, selecting `PATCH` for efficient partial updates ("Modify account details") and choosing an explicit `POST` action via `/cancel` for clarity ("Cancel my order") – we now have well-reasoned solutions for all the original user stories. This allows us to consolidate these decisions and define the first complete specification for the FlexiShop API (v1).

This initial version establishes the API contract needed to support the core features identified at the outset. The following table summarizes these foundational endpoints:

| HTTP Method | Path                          | Purpose / User Story Addressed                  |
|-------------|-------------------------------|-------------------------------------------------|
| POST        | `/v1/accounts`                | Register a new user account                     |
| PATCH       | `/v1/accounts/{accountId}`    | Modify existing account details (partial update) |
| POST        | `/v1/orders`                  | Create a new order                              |
| GET         | `/v1/orders/{orderId}`        | View the details and status of a specific order |
| POST        | `/v1/orders/{orderId}/cancel` | Initiate the process to cancel an existing order|

This specification forms a solid foundation, directly addressing each initial requirement with a clear, pragmatically designed endpoint. While this effectively covers our starting point, APIs are rarely static. New features, changing business logic, and evolving user needs inevitably drive the need for further development and API evolution.

## Conclusion

In this first part, we covered the core principles of pragmatic API design, emphasizing user-centricity and adapting best practices to real-world needs.

We tackled two key dilemmas: choosing between `PUT` and `PATCH` and modeling business actions. These create a solid starting point for the FlexiShop API, addressing the initial requirements.

But effective APIs need more than just individual resource handling. Handling collections and production demands brings new challenges.

### Coming Up Next

1.  **Part 2: Mastering Collections:** We'll dive deep into returning lists of resources. How do you efficiently handle different filtering strategies? What are the most practical approaches to pagination? How should sorting be implemented consistently? We'll explore techniques using FlexiShop's need to display product and order lists.
2.  **Part 3: Ensuring Robustness and Evolution:** The final part tackles critical production concerns: strategies for API evolution and versioning, implementing effective rate limiting, ensuring idempotency for safe retries, and handling asynchronous operations.

Stay tuned as we continue building the FlexiShop API using these pragmatic principles.