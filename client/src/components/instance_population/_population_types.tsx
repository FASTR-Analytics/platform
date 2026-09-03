import { t3, type PopulationTypeInfo } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  Input,
  StateHolderFormError,
  Table,
  type TableColumn,
  createDeleteAction,
  createFormAction,
} from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

// The population type vocabulary: ids are immutable after create (they are
// written into packages and referenced by indicators); labels are editable.
export function PopulationTypesEditor(p: { close: (p: unknown) => void }) {
  const [newId, setNewId] = createSignal("");
  const [newLabel, setNewLabel] = createSignal("");

  const createType = createFormAction(async () => {
    const res = await serverActions.createPopulationType({
      id: newId().trim(),
      label: newLabel().trim(),
    });
    if (res.success) {
      setNewId("");
      setNewLabel("");
    }
    return res;
  });

  const columns: TableColumn<PopulationTypeInfo>[] = [
    {
      key: "id",
      header: t3({ en: "ID", fr: "ID", pt: "ID" }),
      sortable: true,
      render: (item) => <span class="font-mono">{item.id}</span>,
    },
    {
      key: "label",
      header: t3({ en: "Label", fr: "Libellé", pt: "Rótulo" }),
      sortable: true,
      render: (item) => <LabelCell type={item} />,
    },
    {
      key: "actions",
      header: "",
      alignH: "right",
      render: (item) => {
        const deleteAction = createDeleteAction(
          {
            text: t3({
              en: "Delete this population type? Any stored figures for it are deleted too. Indicators whose formula uses it must be changed first.",
              fr: "Supprimer ce type de population ? Les chiffres enregistrés pour ce type seront aussi supprimés. Les indicateurs dont la formule l'utilise doivent d'abord être modifiés.",
              pt: "Eliminar este tipo de população? Os valores guardados para ele também são eliminados. Os indicadores cuja fórmula o usa têm de ser alterados primeiro.",
            }),
            itemList: [`${item.label} (${item.id})`],
          },
          () => serverActions.deletePopulationType({ id: item.id }),
        );
        return (
          <Button
            iconName="trash"
            intent="danger"
            size="sm"
            onClick={deleteAction.click}
          />
        );
      },
    },
  ];

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          heading={t3({
            en: "Population types",
            fr: "Types de population",
            pt: "Tipos de população",
          })}
        >
          <Button onClick={() => p.close(undefined)}>
            {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
          </Button>
        </HeadingBar>
      }
    >
      <div class="ui-pad ui-spy max-w-3xl">
        <Table
          data={instanceState.populationTypes}
          columns={columns}
          keyField="id"
          noRowsMessage={t3({
            en: "No population types",
            fr: "Aucun type de population",
            pt: "Nenhum tipo de população",
          })}
        />
        <div class="ui-spy-sm border-t pt-4">
          <div class="font-700">
            {t3({ en: "Add a type", fr: "Ajouter un type", pt: "Adicionar um tipo" })}
          </div>
          <div class="ui-gap flex items-end">
            <Input
              label={t3({ en: "ID", fr: "ID", pt: "ID" })}
              value={newId()}
              onChange={setNewId}
              mono
            />
            <Input
              label={t3({ en: "Label", fr: "Libellé", pt: "Rótulo" })}
              value={newLabel()}
              onChange={setNewLabel}
              fullWidth
            />
            <Button
              onClick={createType.click}
              state={createType.state()}
              disabled={newId().trim() === "" || newLabel().trim() === ""}
              iconName="plus"
            >
              {t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
            </Button>
          </div>
          <div class="ui-text-caption text-xs">
            {t3({
              en: "The ID is used in population CSV files and cannot be changed after creation.",
              fr: "L'ID est utilisé dans les fichiers CSV de population et ne peut pas être modifié après création.",
              pt: "O ID é usado nos ficheiros CSV de população e não pode ser alterado após a criação.",
            })}
          </div>
          <StateHolderFormError state={createType.state()} />
        </div>
      </div>
    </FrameTop>
  );
}

function LabelCell(p: { type: PopulationTypeInfo }) {
  const [editing, setEditing] = createSignal(false);
  const [label, setLabel] = createSignal(p.type.label);

  const save = createFormAction(async () => {
    const res = await serverActions.updatePopulationType({
      id: p.type.id,
      label: label().trim(),
    });
    if (res.success) setEditing(false);
    return res;
  });

  return (
    <Show
      when={editing()}
      fallback={
        <div class="ui-gap-sm flex items-center">
          <span>{p.type.label}</span>
          <Button
            iconName="pencil"
            intent="neutral"
            size="sm"
            onClick={() => {
              setLabel(p.type.label);
              setEditing(true);
            }}
          />
        </div>
      }
    >
      <div class="ui-spy-sm">
        <div class="ui-gap-sm flex items-center">
          <Input value={label()} onChange={setLabel} size="sm" fullWidth />
          <Button
            onClick={save.click}
            state={save.state()}
            disabled={label().trim() === ""}
            intent="success"
            size="sm"
            iconName="check"
          />
          <Button
            onClick={() => setEditing(false)}
            outline
            size="sm"
            iconName="x"
          />
        </div>
        <StateHolderFormError state={save.state()} />
      </div>
    </Show>
  );
}
