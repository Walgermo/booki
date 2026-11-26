# Agent cursor interactions

`AgentStatus` describes the outcome of the application's work. The floating `AgentCursor` shows which control the agent is approaching and how its permission check resolved. A step can pass that check and still fail validation when executed. Drive the final inline status from the bridge result.

## Inline status

| Application state | Pointer and badge | Entry and exit |
| --- | --- | --- |
| Idle | Still arrow and hollow circle | Initial render is still. Reset returns here. |
| Working | The arrow presses once at its tip. The arc turns while work continues. | The press plays for 220 ms on entry from another state. Rendering an already working status starts only the progress arc. |
| Waiting for a person | Still arrow and pulsing pause bars | The application selects this state when it actually presents a human decision. A pending promise alone does not identify who decides. |
| Done | Check mark | The check draws once on entry. A status mounted already done shows the finished check. |
| Refused | Slashed circle | A refusal uses the same short cross-fade as other changes. The label gives the outcome without relying on color. |

All five states can transition directly to each other. On a change the incoming icon fades in over 150 ms and the outgoing icon fades out over 110 ms. Replacing the label alone leaves the icon in place. The docs demo maps a stopped run to idle with a localized “Stopped by you” label. A subsequent run starts fresh.

## Live pointer

| Interaction | Visible behavior | Decision or next state |
| --- | --- | --- |
| First target | The ring and pointer appear at the target. | There is no glide from the corner of the screen. |
| Write or named button press | Glide to the field or matching button, then press at the tip with one ripple. | Default travel is 420 ms and the press lasts 160 ms. React and Web both honor a custom travel duration. |
| Read or assertion | Ring the whole control. The pointer approaches without pressing. | Includes assertions, checks, explanations, previews, document and account searches, and the overdue query. Snapshot and query calls outside the step gate never lead the cursor. |
| Pending decision | Hold at the target until the permission callback settles. | The app can show an inline waiting status and provide its own decision controls. |
| Allowed or refused | An allowed decision settles at the target. A refusal or thrown decision changes the ring and label to danger. | The last result lingers for 1,600 ms by default, then the overlay clears. A new step takes over immediately. |
| Rest | Park the pointer on a supplied element with an optional label. | Remains until another step, disable, or removal of the element. |
| Scroll, resize, or layout change | Follow the same element immediately. Labels flip left near the right edge and above the pointer near the bottom edge. | Automatic scroll can reveal an offscreen or covered target. Wheel, touch-scroll, and page-scroll keys give the person control until their next pointer press or Enter. |
| Missing or removed target | Clear the old geometry and label. | The permission callback still owns its decision. |
| Superseded or disabled | Interrupt the old visual. A late decision cannot repaint a newer target. | Switching the cursor off skips visual delays. It preserves the underlying permission check. |
| Abort or timeout | Clear the interrupted visual. | An already-aborted request never opens the permission callback. An abort during a pending decision cannot show a late success. |
| Secret field | Narrate the operation and target. | The visible text and the state passed to custom narrators omit step arguments. |
| Web controller removed | Hide its pointer and ring. | The detached controller no longer drives the element. |

## Motion and accessibility

The floating pointer is decorative and does not take focus or intercept input. The inline label is a polite live region, hidden from the agent snapshot. The status preview exposes one announcement across its Paper and Ink examples. People can choose the state using the keyboard. English and Norwegian labels include a textual outcome for every state.

Reduced motion skips cursor travel and press delays, lean, scaling, ripple, rotation, pulsing and check drawing. Inline changes retain a short opacity transition and the new label is available immediately. The live pointer continues to track its target.

## Verification

- [React cursor and controller tests](../packages/react/src/agent-cursor.test.tsx) cover scroll ownership, covered controls, geometry tracking, reads, permissions, cancellation, disable, stale results, missing targets and redacted narration.
- [Status tests](../packages/react/src/agent-status.test.tsx) cover localized labels, custom labels, live-region and snapshot behavior, first render, transitions, badges and shared geometry.
- [Web adapter tests](../packages/web/src/web.test.ts) exercise real bridge actions, the matching pointer geometry and controller detachment. [Label sizing tests](../packages/primitives/src/agent-cursor-label.test.ts) cover horizontal collision handling.
