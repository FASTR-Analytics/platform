# Future idea: OpenHIM compatibility

Research recorded 2026-11-19. Nothing here is built.

## The request

Guinea asked whether FASTR can connect to DHIS2 through an OpenHIE architecture and an OpenHIM gateway, for aggregate data and the facility register. Guinea has started putting this architecture in place and wants every platform to fit into it.

Answer: yes. The simplest form needs one small change in the DHIS2 connector (S7, [SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md)). Two larger forms are possible and depend on how Guinea has configured its gateway.

## What OpenHIE and OpenHIM are

**OpenHIE** is a community and an architecture specification for a national health information exchange. The specification is at version 5.2 (August 2024). It defines:

- Registry services: facility registry, health worker registry, client registry, terminology service, product catalogue.
- Business domain services: the health management information system (HMIS, the role DHIS2 plays), logistics, shared health record, finance and insurance.
- An interoperability layer: the single point of entry into the exchange. It authenticates the calling system, routes the request, and logs the transaction.
- Point-of-service systems: everything outside that calls in.

A system qualifies as a given OpenHIE component when it supports that component's required workflows. A point-of-service or consumer system has no required list.

**OpenHIM** (Open Health Information Mediator, by Jembi Health Systems, MPL 2.0) is the reference implementation of the interoperability layer. It is a reverse proxy with extra features. Core is at 8.5.x and the repository is active.

- A **client** is a registered calling system. It authenticates by Basic auth, mutual TLS, a custom token (`Authorization: Custom <token>`) or a JWT (`Authorization: Bearer <jwt>`).
- A **channel** matches incoming requests by a URL regular expression and forwards them to one or more **routes** (an upstream host, port and optional path transform). A channel is private (named clients or roles only) or public.
- A **mediator** is a separate microservice a channel can route to when a message needs transforming or orchestrating. A plain pass-through to an upstream REST API needs no mediator.
- Every transaction is logged in MongoDB, with its request and response bodies unless the channel turns body storage off.
- Clients call core on port 5000 (HTTPS) or 5001 (HTTP) by default.

## Guinea's design

Source: "Cadre d'interopérabilité des logiciels du secteur de la santé avec DHIS2 en Guinée", Ministry of Health, version 1.0, 30 October 2019, written by a USAID GHSC-PSM consultant.

- DHIS2 is the backbone of the health information system. Other systems (e-SIGL, iHRIS, SAGE) send their data into it.
- OpenHIM is the interoperability layer, with at least one mediator per registry.
- HAPI FHIR holds the registries, in FHIR R4.
- The facility register ("registre des structures") is seeded from the DHIS2 organisation units. The DHIS2 organisation unit id is the base identifier of each facility resource, and the ids used by other systems are stored beside it.
- BI and GIS tools are drawn as consumers that read the registries through OpenHIM channels.
- In 2019 the running parts were DHIS2, e-SIGL, the mediators between them, and a HAPI FHIR server with the facility and product registries, as a pilot.
- The document does not say how a client system authenticates to OpenHIM.

Nothing public describes what is deployed today. The national digital health strategy for 2021 to 2025 mentions OpenHIM only in a list of example open-source tools.

## Option 1: a pass-through channel to the DHIS2 Web API (recommended)

Guinea configures an OpenHIM channel that forwards to the DHIS2 Web API. FASTR stores the channel's URL as its DHIS2 URL.

What already works:

- FASTR treats the DHIS2 URL as a base and appends `/api/...` (`buildUrl` in [base_fetcher.ts](server/dhis2/common/base_fetcher.ts)), so every data call goes through the channel unchanged. The base can include a path prefix, such as `https://gateway.example/dhis2`, which the route's path transform strips.
- With OpenHIM Basic auth, the username and password FASTR stores are the OpenHIM client id and password. OpenHIM removes that `Authorization` header and sends the DHIS2 account configured on the route.
- OpenHIM forwards every other request header, including the `X-Requested-With` header the connector depends on.

What FASTR must change:

- Phase 1 of `validateDhis2Connection` requests `/api/system/info.json` with no credentials. A private channel answers 401 with no DHIS2 marker in the body, so FASTR reports that the URL is not a DHIS2 instance and the connection cannot be saved. Phase 1 has to send the credentials:

```ts
const response = await fetch(phase1Url, {
  headers: { Authorization: createAuthHeader(credentials) },
  signal: phase1Controller.signal,
});
```

What Guinea must set on the channel:

- The DHIS2 service account as the route's username and password.
- The channel timeout. The OpenHIM default is 60 seconds, after which it answers 500. FASTR allows 300 seconds for a data value pull, 180 seconds for a boundary download and 120 seconds for other calls.
- Response-body storage off. OpenHIM holds each upstream response fully in memory before returning it, then stores it with the transaction, truncated at 15 MB. FASTR accepts responses up to 100 MB.
- A TLS certificate the FASTR server trusts. Deno rejects a certificate that is not signed by a trusted authority unless the authority is supplied at start-up (`DENO_CERT`).

## Option 2: other OpenHIM authentication modes

Needed only if Guinea does not allow Basic auth for clients.

FASTR's credential type is `{ url, username, password }` (`Dhis2Credentials` in [dhis2.ts](lib/types/dhis2.ts)) and `createAuthHeader` builds only a Basic header. A custom token, a JWT or a client certificate needs:

- a credential type with an authentication kind;
- the encrypted store and its migration (S6);
- the credentials editor (S7);
- the fetcher and both validation phases.

## Option 3: read the facility register from FHIR

Needed only if Guinea requires facilities to come from the HAPI FHIR register and not from the DHIS2 organisation units.

- The OpenHIE workflow is IHE mCSD: the consumer queries FHIR `Location` and `Organization` resources (transactions ITI-90 "Find Matching Care Services" and ITI-91 "Request Care Services Updates").
- FASTR imports structure from a CSV file or from DHIS2. A FHIR source is a third importer in S5.
- The register must carry the DHIS2 organisation unit id for each facility. The DHIS2 HMIS import keeps a value only when its `orgUnit` is a FASTR facility id (`dispatch.ts` in `server/worker_routines/import_hmis_data_dhis2/`). Guinea's framework makes the DHIS2 id the base identifier, which satisfies this.

## Not worth building: aggregate data through ADX or FHIR

- OpenHIE defines only push workflows for aggregate data: a sender posts an ADX or mADX message into the HMIS. It defines no workflow for a consumer pulling aggregate data out. The specification only recommends that an HMIS offer an analytics API.
- DHIS2 can export ADX from `/api/dataValueSets` with `Accept: application/adx+xml`. It is XML, it must be selected by data set, and it identifies everything by code by default. FASTR pulls JSON by data element id, which carries the same values.
- mADX is the FHIR form (`Measure` and `MeasureReport`). DHIS2 core serves no FHIR API, and the DHIS2 FHIR adapter was archived in January 2022. Guinea would have to build a mediator to produce it.

Reading aggregate data through a pass-through channel (option 1) is how a consumer fits this architecture.

## OpenHIM behaviour verified in its source

Read from `jembi/openhim-core-js`, master, version 8.5.1.

| Behaviour                                                                                                                                                         | Where                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Basic auth and mutual TLS are on by default. Custom token and JWT are off.                                                                                        | `config/default.json`, `authentication`          |
| Authentication runs in the order JWT, custom token, Basic, mutual TLS, then channel matching, then authorisation.                                                 | `src/koaMiddleware.js`                           |
| The client's `Authorization` header is deleted before forwarding unless the route sets `forwardAuthHeader` (default false).                                       | `src/middleware/router.js`                       |
| A route's `username` and `password` are sent upstream as Basic auth.                                                                                              | `src/middleware/router.js`                       |
| A request that matches a private channel without an authorised client gets 401 and `WWW-Authenticate: Basic`. A request that matches no channel gets 404.         | `src/middleware/authorisation.js`                |
| An IP whitelist is an extra condition on top of client authorisation. It does not replace it, although the documentation says it gives access without a password. | `src/middleware/authorisation.js`                |
| The route timeout defaults to 60 000 ms. A channel's `timeout` overrides it, up to 3 600 000 ms.                                                                  | `config/default.json`, `src/model/channels.js`   |
| The upstream response is collected fully in memory before it is returned.                                                                                         | `src/middleware/router.js`                       |
| Stored bodies are truncated at `api.maxBodiesSizeMB` (15). A channel's `requestBody` and `responseBody` flags turn storage off.                                   | `src/utils.js`, `src/middleware/messageStore.js` |
| A route's `pathTransform` is a sed-style `s/from/to/` applied to the request path.                                                                                | `src/middleware/router.js`                       |

## What to ask Guinea

- Which client authentication does their OpenHIM use: Basic auth, mutual TLS, a custom token or a JWT?
- Is the DHIS2 Web API exposed as a pass-through channel, and at what URL?
- Should FASTR read facilities from the DHIS2 organisation units or from the HAPI FHIR facility register? If the register, does each facility carry its DHIS2 organisation unit id?
- Does the gateway present a publicly trusted TLS certificate?

## Sources

- OpenHIE Architecture Specification: <https://guides.ohie.org/arch-spec/>
- OpenHIE aggregate reporting workflows: <https://guides.ohie.org/arch-spec/introduction/aggregate-reporting-workflows>
- OpenHIE care services discovery workflows: <https://guides.ohie.org/arch-spec/introduction/care-services-discovery>
- OpenHIM documentation: <https://openhim.org/docs/introduction/about>, <https://openhim.org/docs/configuration/authentication>, <https://openhim.org/docs/configuration/channels>
- OpenHIM core source: <https://github.com/jembi/openhim-core-js>
- Guinea interoperability framework, 2019 (archived copy): <https://web.archive.org/web/20240729114245/https://portail.sante.gov.gn/wp-content/uploads/2023/06/3_-Document-du-cadre-d_interoperabilite%CC%81-DHIS2_Guine%CC%81e_Final.pdf>
- Guinea national digital health strategy 2021 to 2025: <https://extranet.who.int/cpcd/sites/default/files/public_file_repository/gui_guinea_strategie-nationale-sante-numerique_2021-2025.pdf>
- DHIS2 2.41 API, data values and ADX: <https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-241/data.html>
- DHIS2 2.41 API, authentication: <https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-241/introduction.html>
- DHIS2 integration concepts: <https://docs.dhis2.org/en/implement/implementing-dhis2/integration-concepts.html>
- DHIS2 FHIR adapter (archived): <https://github.com/dhis2/dhis2-fhir-adapter>
