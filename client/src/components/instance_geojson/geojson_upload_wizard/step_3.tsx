import { t3 } from"lib";
import { Button, Select } from"panther";
import { For, Show, createMemo } from"solid-js";
import type { WizardState, Dhis2FeatureContext } from"./index";

type Props = {
 state: WizardState;
};

type GroupedFeature = {
 geoVal: string;
 features: Dhis2FeatureContext[];
};

export function Step3(p: Props) {
 const { state } = p;

 const geoJsonValues = createMemo(() => {
 const result = state.analysisResult();
 const prop = state.selectedProp();
 if (!result || !prop) return [];
 return result.sampleValues[prop] ?? [];
  });

 const groupedByMatchProp = createMemo((): GroupedFeature[] => {
 if (state.source() ==="file") {
 return geoJsonValues().map((v) => ({ geoVal: v, features: [] }));
    }

 const dhis2Features = state.dhis2Features();
 const selectedProp = state.selectedProp();

 const groups = new Map<string, Dhis2FeatureContext[]>();
 for (const f of dhis2Features) {
 const matchVal = selectedProp ==="name"? f.name : selectedProp ==="code"? (f.code ??"") : f.name;
 if (!groups.has(matchVal)) {
 groups.set(matchVal, []);
      }
 groups.get(matchVal)!.push(f);
    }

 return geoJsonValues().map((v) => ({
 geoVal: v,
 features: groups.get(v) ?? [],
    }));
  });

 const mappedCount = createMemo(() => Object.keys(state.geoToAdmin()).length);
 const unmappedGeoCount = createMemo(() => geoJsonValues().length - mappedCount());

 const adminAreaOptions = createMemo(() => {
 return [
      { value:"", label: t3({ en:"— Not mapped —", fr:"— Non mappé —", pt:"— Não associado —"}) },
      ...state.adminAreaOptions(),
    ];
  });

 function updateMapping(geoJsonValue: string, adminAreaName: string) {
 state.setGeoToAdmin((prev) => {
 const next = { ...prev };
 if (adminAreaName ==="") {
 delete next[geoJsonValue];
      } else {
 next[geoJsonValue] = adminAreaName;
      }
 return next;
    });
  }

 const hasDhis2Ambiguity = createMemo(() => {
 return groupedByMatchProp().some((g) => g.features.length > 1);
  });

 return (
    <div class="ui-spy">
      <div class="ui-spy-sm">
        <div class="font-700">
          {t3({ en:"Step 3: Map GeoJSON features to admin areas", fr:"Étape 3 : Associer les entités GeoJSON aux unités administratives", pt:"Passo 3: Associar as entidades GeoJSON às zonas administrativas"})}
          {""}AA{state.adminAreaLevel()}
        </div>
        <div class="text-base-content-muted text-sm">
          {mappedCount()}/{geoJsonValues().length} {t3({ en:"mapped", fr:"mappés", pt:"associados"})}
          <Show when={unmappedGeoCount() > 0}>
            {""}
            <span class="text-warning">
              ({unmappedGeoCount()} {t3({ en:"unmapped", fr:"non mappés", pt:"não associados"})})
            </span>
          </Show>
        </div>
        <Show when={hasDhis2Ambiguity()}>
          <div class="text-warning text-sm">
            {t3({ en:"Some DHIS2 org units share the same name. Use the UID and parent info to select the correct one.", fr:"Certaines unités d'organisation DHIS2 partagent le même nom. Utilisez l'UID et les informations sur le parent pour sélectionner la bonne.", pt:"Algumas unidades organizacionais DHIS2 partilham o mesmo nome. Utilize o UID e as informações da unidade-mãe para selecionar a correta."})}
          </div>
        </Show>
      </div>

      <div class="max-h-96 overflow-auto rounded border">
        <div class="bg-base-100 flex border-b px-3 py-2 text-sm font-700">
          <div class="w-1/2">{t3({ en:"GeoJSON value", fr:"Valeur GeoJSON", pt:"Valor GeoJSON"})}</div>
          <div class="w-1/2">{t3({ en:"Admin area", fr:"Unité administrative", pt:"Zona administrativa"})}</div>
        </div>
        <For each={groupedByMatchProp()}>
          {(group) => (
            <Show
 when={group.features.length > 1}
 fallback={
                <div class="border-base-200 flex items-center border-b px-3 py-1 last:border-b-0">
                  <div class="w-1/2 text-sm font-mono">{group.geoVal}</div>
                  <div class="w-1/2">
                    <Select
 options={adminAreaOptions()}
 value={state.geoToAdmin()[group.geoVal] ??""}
 onChange={(v) => updateMapping(group.geoVal, v)}
 fullWidth
 size="sm"
                    />
                  </div>
                </div>
              }
            >
              <For each={group.features}>
                {(feature) => (
                  <div class="border-base-200 flex items-center border-b px-3 py-1 last:border-b-0 bg-base-200">
                    <div class="w-1/2">
                      <div class="text-sm font-mono">{group.geoVal}</div>
                      <div class="ui-text-caption">
 uid: {feature.uid}
                        <Show when={feature.parentName}>
                          {"·"}parent: {feature.parentName}
                        </Show>
                      </div>
                    </div>
                    <div class="w-1/2">
                      <Select
 options={adminAreaOptions()}
 value={state.geoToAdmin()[group.geoVal] ??""}
 onChange={(v) => updateMapping(group.geoVal, v)}
 fullWidth
 size="sm"
                      />
                    </div>
                  </div>
                )}
              </For>
            </Show>
          )}
        </For>
      </div>

      <div class="ui-gap-sm flex">
        <Button onClick={() => state.setStep(4)} disabled={mappedCount() === 0} intent="primary">
          {t3({ en:"Review & save", fr:"Vérifier et enregistrer", pt:"Rever e guardar"})}
        </Button>
        <Button intent="neutral"onClick={() => state.setStep(2)}>
          {t3({ en:"Back", fr:"Retour", pt:"Voltar"})}
        </Button>
      </div>
    </div>
  );
}
