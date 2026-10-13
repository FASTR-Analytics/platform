// Every kit component in the variants the editor uses, for the parity probe
// and for looking at.
import { createSignal } from "solid-js";
import {
  Button,
  Card,
  FormError,
  Input,
  Modal,
  ModalHost,
  type ModalProps,
  openModal,
  RadioGroup,
  showMenu,
} from "report-forge";

function Sample(p: ModalProps<object, undefined>) {
  return (
    <Modal
      width="md"
      title="Probe"
      onCancel={() => p.close(undefined)}
      actions={[{ label: "OK", onClick: () => p.close(undefined) }]}
    >
      <div data-probe-modal>body</div>
    </Modal>
  );
}

export function Kit() {
  const [text, setText] = createSignal("Hello");
  const [choice, setChoice] = createSignal<"a" | "b">("a");
  return (
    <div
      class="rf-root"
      style={{ padding: "24px", display: "grid", gap: "16px", width: "900px" }}
    >
      <div data-p="btn-ghost-sm-icon">
        <Button ghost size="sm" iconName="chevronLeft" />
      </div>
      <div data-p="btn-ghost-sm-icon-right">
        <Button ghost size="sm" iconName="chevronRight" iconPosition="right">
          Report tabs
        </Button>
      </div>
      <div data-p="btn-neutral-outline-icon">
        <Button intent="neutral" outline iconName="chevronLeft">Back</Button>
      </div>
      <div data-p="btn-sm-outline-icon">
        <Button size="sm" outline iconName="x" />
      </div>
      <div data-p="btn-sm-outline-icon-label">
        <Button size="sm" outline iconName="upload">Upload logo</Button>
      </div>
      <div data-p="btn-sm-outline-danger">
        <Button size="sm" outline intent="danger" iconName="trash">
          Remove
        </Button>
      </div>
      <div data-p="btn-default">
        <Button>Insert</Button>
      </div>
      <div data-p="btn-default-disabled">
        <Button disabled>Insert</Button>
      </div>
      <div data-p="btn-outline">
        <Button outline>Cancel</Button>
      </div>
      <div data-p="btn-outline-sm-base200">
        <Button size="sm" outline onSurface2>Dismiss</Button>
      </div>
      <div data-p="btn-outline-icon">
        <Button outline iconName="download">Download</Button>
      </div>
      <div data-p="input">
        <Input label="Alt text" value={text()} onChange={setText} />
      </div>
      <div data-p="radio">
        <RadioGroup
          label="Format"
          options={[{ value: "a", label: "PDF" }, {
            value: "b",
            label: "Word",
          }]}
          value={choice()}
          onChange={setChoice}
        />
      </div>
      <div data-p="card">
        <Card>
          <div>card body</div>
        </Card>
      </div>
      <div data-p="error">
        <FormError error="Something failed" />
      </div>
      <div data-p="modal" style={{ position: "relative" }}>
        <Modal
          width="md"
          title="Insert image"
          onCancel={() => {}}
          actions={[{ label: "Insert", onClick: () => {} }, {
            label: "Disabled",
            onClick: () => {},
            disabled: true,
          }]}
        >
          <div>modal body</div>
        </Modal>
      </div>
      <div>
        <Button
          outline
          onClick={() => void openModal({ element: Sample, props: {} })}
        >
          Open a modal
        </Button>{" "}
        <Button
          outline
          onClick={(e) =>
            showMenu({
              anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
              items: [
                { label: "Heading row", disabled: true },
                { type: "divider" },
                { label: "Add step before" },
                {
                  label: "Columns",
                  subMenu: [{ label: "1" }, { label: "2 ✓" }],
                },
                { type: "divider" },
                { label: "Delete", intent: "danger" },
              ],
            })}
        >
          Open a menu
        </Button>
      </div>
      <ModalHost />
    </div>
  );
}
