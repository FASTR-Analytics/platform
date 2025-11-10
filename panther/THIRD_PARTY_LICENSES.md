# Third-Party Licenses

This document lists all third-party dependencies used in the timroberton-panther
library, including their copyright notices and full license texts as required by
their respective licenses.

## Dependencies from deno.json

### Deno Standard Library

1. **@std/path** - `jsr:@std/path@0.217.0`
2. **@std/fs** - `jsr:@std/fs@0.217.0` (empty_dir, ensure_dir, ensure_file)
3. **@std/encoding** - `jsr:@std/encoding@0.217.0` (base64)

### Graphics & Canvas

4. **@gfx/canvas** - `jsr:@gfx/canvas@0.5.6`

### Document Generation

5. **jspdf** - `npm:jspdf@^3.0.1`
6. **xlsx** - `npm:xlsx@0.18.5`
7. **papaparse** - `npm:papaparse@5.4.1`
8. **markdown-it** - `npm:markdown-it@^14.1.0`
9. **docx** - `npm:docx@^9.5.1`

### UI Framework

10. **solid-js** - `npm:solid-js@^1.8.0` (includes web and store subpaths)
11. **@solidjs/router** - `npm:@solidjs/router@^0.13.0`
12. **sortablejs** - `npm:sortablejs@^1.15.0`

## Vendored Dependencies

13. **FileSaver.js** - Vendored in
    `modules/_301_util_funcs/file_saver_vendored.ts`
14. **solid-sortablejs** - v2.1.2, vendored in
    `modules/_303_components/form_inputs/solid_sortablejs_vendored.tsx`

---

## License Information

**Verification Date:** October 6, 2025

All dependencies listed below use permissive open-source licenses (MIT or
Apache-2.0), which allow free use, modification, and distribution in both
commercial and non-commercial projects.

### Deno Standard Library (@std)

**License:** MIT License

**Repository:** <https://github.com/denoland/std>

**Verification:** The Deno Standard Library is open source under the MIT
License. All components (@std/path, @std/fs, @std/encoding) are part of the
official Deno standard library maintained by the Deno team. The entire standard
library is now available on JSR (JavaScript Registry) and remains MIT licensed.

**Source:** <https://github.com/denoland/std> - Verified October 6, 2025

---

### @gfx/canvas

**License:** Apache-2.0 License

**Repository:** <https://github.com/DjDeveloperr/skia_canvas>

**Verification:** @gfx/canvas (also known as skia_canvas) is a fast HTML Canvas
API implementation for Deno using Google Skia. Created by DjDeveloperr, the
project is licensed under Apache-2.0. This is the FFI-based version
(recommended) available on JSR, offering better performance than the WASM
alternative.

**Copyright:** 2022-present © DjDeveloperr

**Source:** <https://jsr.io/@gfx/canvas> and
<https://github.com/DjDeveloperr/skia_canvas> - Verified October 6, 2025

---

### jspdf

**License:** MIT License

**Repository:** <https://github.com/parallax/jsPDF>

**Verification:** jsPDF is a client-side JavaScript PDF generation library
licensed under the MIT License. The library is actively maintained with the
latest version (3.0.3 as of verification date) and copyright is held by James
Hall (2010-2025) and yWorks GmbH (2015-2025).

**Source:** <https://www.npmjs.com/package/jspdf> and
<https://github.com/parallax/jsPDF/blob/master/LICENSE> - Verified October 6,
2025

---

### xlsx (SheetJS)

**License:** Apache-2.0 License

**Repository:** <https://git.sheetjs.com/sheetjs/sheetjs> (moved from GitHub)

**Verification:** SheetJS Community Edition (xlsx package) is licensed under
Apache 2.0. The package version 0.18.5 on npm is the last version published to
npm (4 years ago). The project has moved to <https://git.sheetjs.com> and newer
versions are available there, but the npm package we use (0.18.5) remains Apache
2.0 licensed.

**Note:** The project is no longer maintained on GitHub or published to npm. All
rights not explicitly granted by the Apache 2.0 License are reserved by the
original author.

**Source:** <https://www.npmjs.com/package/xlsx> and
<https://git.sheetjs.com/sheetjs/sheetjs> - Verified October 6, 2025

---

### papaparse

**License:** MIT License

**Repository:** <https://github.com/mholt/PapaParse>

**Verification:** PapaParse is a fast and powerful CSV parser for JavaScript,
licensed under the MIT License. Copyright is held by Matthew Holt since 2015.
The library is well-maintained with version 5.5.3 (latest as of verification)
and is used by over 2,200 projects in the npm registry.

**Source:** <https://www.npmjs.com/package/papaparse> and
<https://github.com/mholt/PapaParse/blob/master/LICENSE> - Verified October 6,
2025

---

### markdown-it

**License:** MIT License

**Repository:** <https://github.com/markdown-it/markdown-it>

**Verification:** markdown-it is a markdown parser done right, providing 100%
CommonMark support with extensions, syntax plugins, and high speed. Licensed
under the MIT License. The project is actively maintained with version 14.1.0
(latest as of verification) and is a popular choice for markdown parsing with
extensive plugin ecosystem.

**Source:** <https://www.npmjs.com/package/markdown-it> and
<https://github.com/markdown-it/markdown-it> - Verified October 6, 2025

---

### docx

**License:** MIT License

**Repository:** <https://github.com/dolanmiu/docx>

**Verification:** docx is a library to easily generate and modify .docx files
with JavaScript/TypeScript using a declarative API. Licensed under the MIT
License with copyright by Dolan Miu. Works for both Node and browser
environments. Version 9.5.1 (latest as of verification).

**Source:** <https://www.npmjs.com/package/docx> and
<https://github.com/dolanmiu/docx> - Verified October 6, 2025

---

### solid-js

**License:** MIT License

**Repository:** <https://github.com/solidjs/solid>

**Verification:** Solid.js is a declarative, efficient, and flexible JavaScript
library for building user interfaces. Licensed under the MIT License with
copyright "(c) 2016-2025 Ryan Carniato". The project is actively maintained with
version 1.9.9 (as of verification date) and is used by over 800 projects in the
npm registry.

**Source:** <https://www.npmjs.com/package/solid-js> and
<https://github.com/solidjs/solid/blob/main/LICENSE> - Verified October 6, 2025

---

### @solidjs/router

**License:** MIT License

**Repository:** <https://github.com/solidjs/solid-router>

**Verification:** @solidjs/router is the universal router for SolidJS,
supporting both client and server-side rendering. Licensed under the MIT License
and maintained by the SolidJS team. Latest version is 0.15.3 (as of verification
date).

**Source:** <https://www.npmjs.com/package/@solidjs/router> and
<https://github.com/solidjs/solid-router> - Verified October 6, 2025

---

### sortablejs

**License:** MIT License

**Repository:** <https://github.com/SortableJS/Sortable>

**Verification:** SortableJS provides reorderable drag-and-drop lists for modern
browsers and touch devices with no jQuery or framework required. Licensed under
the MIT License with copyright to all contributors (2019-present). The library
is extremely popular with 30,000+ GitHub stars and 1.7M+ weekly npm downloads.
Version 1.15.6 is the latest (as of verification).

**Source:** <https://www.npmjs.com/package/sortablejs> and
<https://github.com/SortableJS/Sortable/blob/master/LICENSE> - Verified October
6, 2025

---

### FileSaver.js (Vendored)

**License:** MIT License

**Original Repository:** <https://github.com/eligrey/FileSaver.js>

**Verification:** FileSaver.js is an HTML5 saveAs() FileSaver implementation by
Eli Grey, licensed under the MIT License. Copyright © 2016 Eli Grey. The
vendored copy in this library includes the original license header from the
source.

**Vendored Location:** `modules/_301_util_funcs/file_saver_vendored.ts`

**Source:** <https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md> -
Verified October 6, 2025

---

### solid-sortablejs (Vendored)

**License:** MIT License

**Original Package:** solid-sortablejs v2.1.2 (npm)

**Verification:** solid-sortablejs provides SortableJS bindings for SolidJS and
is licensed under the MIT License. The vendored version includes patches applied
via patch-package for MultiDrag plugin support and animation fixes. The original
repository (thisbeyond/solid-sortablejs) is no longer accessible, but the npm
package remains MIT licensed.

**Vendored Location:**
`modules/_303_components/form_inputs/solid_sortablejs_vendored.tsx`

**Source:** <https://socket.dev/npm/package/solid-sortablejs> - Verified October
6, 2025

---

## Full License Texts

### MIT License

The following dependencies use the MIT License:

- Deno Standard Library (@std/path, @std/fs, @std/encoding)
- jspdf
- papaparse
- markdown-it
- docx
- solid-js
- @solidjs/router
- sortablejs
- FileSaver.js
- solid-sortablejs

#### MIT License Text

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

#### Copyright Notices for MIT-Licensed Dependencies

**Deno Standard Library**

- Copyright (c) 2018-2025 the Deno authors

**jspdf**

- Copyright (c) 2010-2025 James Hall
- Copyright (c) 2015-2025 yWorks GmbH

**papaparse**

- Copyright (c) 2015 Matthew Holt

**markdown-it**

- Copyright (c) 2014 Vitaly Puzrin and contributors

**docx**

- Copyright (c) 2016-2025 Dolan Miu

**solid-js**

- Copyright (c) 2016-2025 Ryan Carniato

**@solidjs/router**

- Copyright (c) 2021-2025 Ryan Carniato and contributors

**sortablejs**

- Copyright (c) 2019 All contributors to Sortable

**FileSaver.js**

- Copyright (c) 2016 Eli Grey

**solid-sortablejs**

- Copyright (c) 2022 Supertigerr

---

### Apache License 2.0

The following dependencies use the Apache License 2.0:

- @gfx/canvas
- xlsx (SheetJS Community Edition)

#### Apache License 2.0 Text

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Support. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS
```

#### Copyright Notices for Apache-2.0 Licensed Dependencies

**@gfx/canvas (skia_canvas)**

- Copyright (c) 2022-present DjDeveloperr

**xlsx (SheetJS Community Edition)**

- Copyright (C) 2012-present SheetJS LLC

---

## Summary

All external dependencies in timroberton-panther use permissive open-source
licenses that allow free use, modification, and distribution in both commercial
and non-commercial applications.

**License Compliance Requirements:**

1. Include this THIRD_PARTY_LICENSES.md file (or equivalent) with any
   distribution
2. Retain all copyright notices listed above
3. Do not use contributor names for endorsement without permission

**Vendored Code:**

- FileSaver.js and solid-sortablejs include their license headers directly in
  the source code files
