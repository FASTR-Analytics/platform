import { t3, type InstanceConfigAdminAreaLabels } from "lib";
import {
  Button,
  Card,
  FrameTop,
  HeadingBar,
  Input,
  createButtonAction,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState, maxDepth } from "~/state/instance/t1_store";

type Props = {
  backToInstance: () => void;
};

// The `(AAn)` suffix is a display convention carried in the stored value, not
// something the user types.
function stripAdminSuffix(v: string | undefined, level: number): string {
  return (v ?? "").replace(new RegExp(`\\s*\\(AA${level}\\)$`), "");
}

function withAdminSuffix(v: string, level: number): string | undefined {
  const trimmed = v.trim();
  return trimmed ? `${trimmed} (AA${level})` : undefined;
}

// Admin area level NAMES are a country fact ("Region", "District"), shared by
// both facility registries — the one structure setting that is deliberately
// not per-family. One editor, one stored value.
export function AdminAreaLabels(p: Props) {
  const [adminLabel2, setAdminLabel2] = createSignal<string>(
    stripAdminSuffix(instanceState.adminAreaLabels.label2, 2),
  );
  const [adminLabel3, setAdminLabel3] = createSignal<string>(
    stripAdminSuffix(instanceState.adminAreaLabels.label3, 3),
  );
  const [adminLabel4, setAdminLabel4] = createSignal<string>(
    stripAdminSuffix(instanceState.adminAreaLabels.label4, 4),
  );
  const [needsSaving, setNeedsSaving] = createSignal(false);

  const updateAdminAreaLabels = createButtonAction(async () => {
    const newConfig: InstanceConfigAdminAreaLabels = {
      label2: withAdminSuffix(adminLabel2(), 2),
      label3: withAdminSuffix(adminLabel3(), 3),
      label4: withAdminSuffix(adminLabel4(), 4),
    };
    const res = await serverActions.updateAdminAreaLabelsConfig(newConfig);
    if (res.success) {
      setNeedsSaving(false);
    }
    return res;
  });

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          onBack={p.backToInstance}
          heading={t3({
            en: "Admin area labels",
            fr: "Libellés des unités administratives",
            pt: "Rótulos das zonas administrativas",
          })}
        />
      }
    >
      <div class="ui-pad ui-spy max-w-3xl overflow-auto">
        <Card
          header={t3({
            en: "Admin area labels",
            fr: "Libellés des unités administratives",
            pt: "Rótulos das zonas administrativas",
          })}
          headerRight={
            <Show when={needsSaving()}>
              <Button
                onClick={() => updateAdminAreaLabels.click()}
                state={updateAdminAreaLabels.state()}
                intent="success"
              >
                {t3({
                  en: "Update admin area labels",
                  fr: "Mettre à jour les libellés",
                  pt: "Atualizar os rótulos das zonas administrativas",
                })}
              </Button>
            </Show>
          }
        >
          <div class="ui-spy-sm">
            <div class="ui-text-caption">
              {t3({
                en: 'These names are shared by both facility registries. Enter the singular form (e.g. "District" not "Districts"). Leave blank to use the default.',
                fr: "Ces noms sont partagés par les deux registres d'établissements. Saisissez la forme singulière (par ex. « District » et non « Districts »). Laissez vide pour utiliser la valeur par défaut.",
                pt: 'Estes nomes são partilhados pelos dois registos de estabelecimentos. Introduza a forma singular (por ex. "Distrito" e não "Distritos"). Deixe em branco para utilizar a predefinição.',
              })}
            </div>
            <For
              each={[
                {
                  level: 2 as const,
                  value: adminLabel2,
                  setter: setAdminLabel2,
                  exampleEn: "Region",
                  exampleFr: "Région",
                },
                {
                  level: 3 as const,
                  value: adminLabel3,
                  setter: setAdminLabel3,
                  exampleEn: "District",
                  exampleFr: "District",
                },
                {
                  level: 4 as const,
                  value: adminLabel4,
                  setter: setAdminLabel4,
                  exampleEn: "Catchment",
                  exampleFr: "Zone",
                },
              ].filter((row) => row.level <= maxDepth())}
            >
              {(row) => (
                <div class="ui-gap flex items-center">
                  <div class="w-56">
                    {t3({
                      en: `Admin area ${row.level}`,
                      fr: `Unité administrative ${row.level}`,
                      pt: `Zona administrativa ${row.level}`,
                    })}
                  </div>
                  <div class="w-96">
                    <Input
                      value={row.value()}
                      onChange={(value) => {
                        row.setter(value);
                        setNeedsSaving(true);
                      }}
                      placeholder={t3({
                        en: `e.g. ${row.exampleEn}`,
                        fr: `ex. ${row.exampleFr}`,
                        pt: `por ex. ${row.exampleEn}`,
                      })}
                      fullWidth
                    />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Card>
      </div>
    </FrameTop>
  );
}
