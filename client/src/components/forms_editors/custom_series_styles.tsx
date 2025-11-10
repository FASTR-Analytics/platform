import { AlertComponentProps, Button } from "panther";
import { For } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { CustomSeriesStyle, T, _KEY_COLORS, _RANDOM_BLUE, t2 } from "lib";
import { t } from "lib";

export function CustomSeriesStyles(
  p: AlertComponentProps<
    {
      starting: CustomSeriesStyle[] | undefined;
    },
    CustomSeriesStyle[]
  >,
) {
  const [tempStyles, setTempStyles] = createStore<CustomSeriesStyle[]>(
    structuredClone(
      p.starting ?? [{ color: "#74CEDF", lineStyle: "solid", strokeWidth: 5 }],
    ),
  );

  function add() {
    setTempStyles((prev) => {
      return [
        ...prev,
        { color: "#74CEDF", lineStyle: "solid", strokeWidth: 5 },
      ];
    });
  }

  function del(i: number) {
    setTempStyles((prev) => {
      if (prev.length === 1) {
        return prev;
      }
      return prev.toSpliced(i, 1);
    });
  }

  function update(i: number, color: string) {
    setTempStyles((prev) => {
      const newStyles = structuredClone(prev);
      newStyles[i].color = color;
      return newStyles;
    });
  }

  function done() {
    const finalStyles = unwrap(tempStyles);
    if (finalStyles.length === 0) {
      window.alert("You must have at least one color");
      return;
    }
    return p.close(finalStyles);
  }

  return (
    <div class="ui-spy px-8 py-6">
      <div class="font-700 text-xl">{t("Custom series colors")}</div>
      <div class="ui-spy-sm">
        <For each={tempStyles}>
          {(s, i) => {
            return (
              <div class="ui-gap-sm flex items-center">
                <div class="flex-none">{i() + 1}.</div>
                <div class="h-6 flex-1" style={{ background: s.color }}></div>
                <ColorPicker
                  id={`_${i()}`}
                  onSelectColor={(c) => update(i(), c)}
                />
                <span
                  class="text-danger cursor-pointer text-sm hover:underline"
                  onClick={() => del(i())}
                >
                  {t("del")}
                </span>
              </div>
            );
          }}
        </For>
        <div class="">
          <span
            class="text-success cursor-pointer text-sm hover:underline"
            onClick={add}
          >
            {t2(T.FRENCH_UI_STRINGS.add)}
          </span>
        </div>
      </div>
      <div class="ui-gap-sm flex">
        <Button onClick={done} intent="success" iconName="save">
          {t2(T.FRENCH_UI_STRINGS.save)}
        </Button>
        <Button
          onClick={() => p.close(undefined)}
          intent="neutral"
          iconName="x"
        >
          {t2(T.FRENCH_UI_STRINGS.cancel)}
        </Button>
      </div>
    </div>
  );
}

type ColorPickerProps = {
  id: string;
  onSelectColor: (color: string) => void;
};

function ColorPicker(p: ColorPickerProps) {
  let pickerEl!: HTMLDivElement & PopoverInvokerElement;

  function selectColor(color: string) {
    p.onSelectColor(color);
    pickerEl.hidePopover();
  }

  return (
    <>
      <button
        id={`btn_${p.id}`}
        class="text-neutral relative select-none rounded text-sm hover:underline"
        //@ts-ignore
        popovertarget={`popover_${p.id}`}
        style={{
          //@ts-ignore
          "anchor-name": `--${p.id}`,
        }}
        // onClick={(e) => {
        //   e.preventDefault();
        // }}
      >
        {t("edit")}
      </button>
      <div
        ref={pickerEl}
        id={`popover_${p.id}`}
        style={{
          position: "absolute",
          //@ts-ignore
          "position-anchor": `--${p.id}`,
          top: "unset",
          right: "unset",
          bottom: `anchor(center)`,
          left: `anchor(right)`,
          translate: "5px 50%",
          "inline-size": "max-content",
          "max-inline-size": "25ch",
        }}
        // class="bottom-0 top-0"
        class="white text-base-100 absolute rounded px-2 py-1.5 text-sm shadow-lg"
        popover
        //@ts-ignore
        anchor={`btn_${p.id}`}
      >
        <div class="grid grid-cols-6">
          <For
            each={[
              _RANDOM_BLUE,
              _KEY_COLORS.base100,
              _KEY_COLORS.base200,
              _KEY_COLORS.base300,
              "#e53935",
              "#d81b60",
              "#8e24aa",
              "#5e35b1",
              "#3949ab",
              "#1e88e5",
              "#039be5",
              "#00acc1",
              "#00897b",
              "#43a047",
              "#7cb342",
              "#c0ca33",
              "#fdd835",
              "#ffb300",
              "#fb8c00",
              "#f4511e",
              "#6d4c41",
              "#757575",
              "#546e7A",
              "#000000",
            ]}
          >
            {(color) => {
              return (
                <div
                  class="ui-hoverable col-span-1 h-8 w-8"
                  style={{ background: color }}
                  onClick={() => selectColor(color)}
                ></div>
              );
            }}
          </For>
        </div>
      </div>
    </>
  );
}
