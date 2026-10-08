import {
  type APIResponseNoData,
  canUseScope,
  type OtherUser,
  type ProductAccess,
  type ProductDefaultAccess,
  type ProductGrant,
  type ProductGrantLevel,
  type ScopeId,
  t3,
} from "lib";
import {
  type AlertComponentProps,
  Button,
  createFormAction,
  Field,
  ModalContainer,
  Select,
  type SelectOption,
  SelectSearch,
} from "panther";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { canOwnProduct } from "~/state/instance/product_access";
import { instanceState, productById } from "~/state/instance/t1_store";
import { descendantIds } from "./folder_tree";

// The entry that opens the access dialog, in the product menu and both
// editors' File menus (R14): never "Share…", which already means email a PDF.
export const manageAccessLabel = () =>
  t3({
    en: "Manage access…",
    fr: "Gérer l'accès…",
    pt: "Gerir o acesso…",
  });

// "Manage access…" (PLAN_PRODUCT_OWNERSHIP §2.9) for one product, and its bulk
// mode, "Set access for everything in this folder…" (§2.11), for a global
// admin. The dialog cannot produce the server's three refusals: it never
// offers the owner as a grantee, offers only roster users, and lists each
// person once.
type Props =
  | { mode: "product"; productId: string }
  | { mode: "folder"; folderId: string };

export function ProductAccessModal(
  p: AlertComponentProps<Props, true | undefined>,
) {
  return (
    <Show
      when={p.mode === "product" ? p.productId : undefined}
      keyed
      fallback={
        <Show when={p.mode === "folder" ? p.folderId : undefined} keyed>
          {(folderId) => (
            <FolderAccessForm
              folderId={folderId}
              close={() => p.close(undefined)}
              done={() => p.close(true)}
            />
          )}
        </Show>
      }
    >
      {(productId) => (
        <ProductAccessForm
          productId={productId}
          close={() => p.close(undefined)}
          done={() => p.close(true)}
        />
      )}
    </Show>
  );
}

// What the server does on a transfer (R10): the previous owner, if any,
// becomes an edit grantee and the new owner's grant goes. Applied to the draft
// when an owner is picked, and to the stored access to know whether the draft
// asks for more than the transfer itself.
function withOwner(access: ProductAccess, owner: string): ProductAccess {
  const previous = access.owner;
  const kept = access.grants.filter((g) =>
    g.email !== owner && g.email !== previous
  );
  return {
    owner,
    defaultAccess: access.defaultAccess,
    grants: previous === null || previous === owner
      ? kept
      : [...kept, { email: previous, level: "edit" }],
  };
}

function sameAccess(a: ProductAccess, b: ProductAccess): boolean {
  const key = (grants: ProductGrant[]) =>
    grants.map((g) => `${g.email}:${g.level}`).sort().join("\n");
  return a.owner === b.owner && a.defaultAccess === b.defaultAccess &&
    key(a.grants) === key(b.grants);
}

function userByEmail(email: string): OtherUser | undefined {
  return instanceState.users.find((u) => u.email === email);
}

function personLabel(email: string): string {
  const user = userByEmail(email);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  return name ? `${name} (${email})` : email;
}

// A grant to a restricted user who lacks the product's scope is accepted and
// stays inert until their scope access changes (R6), so the dialog says so.
function lacksScope(email: string, scopeId: ScopeId | undefined): boolean {
  const user = userByEmail(email);
  if (user === undefined || user.scopeAccess.all) return false;
  return scopeId === undefined || !canUseScope(user.scopeAccess, scopeId);
}

const lacksScopeLabel = (bulk: boolean) =>
  bulk
    ? t3({
      en: "Only reaches products in their scopes",
      fr: "N'accède qu'aux produits de ses portées",
      pt: "Só acede aos produtos dos seus âmbitos",
    })
    : t3({
      en: "No access to this product's scope",
      fr: "Aucun accès à la portée de ce produit",
      pt: "Sem acesso ao âmbito deste produto",
    });

function candidateOptions(
  exclude: Set<string>,
  scopeId: ScopeId | undefined,
  bulk: boolean,
  includeAdmins: boolean,
): SelectOption<string>[] {
  return instanceState.users
    .filter((u) => !exclude.has(u.email) && (includeAdmins || !u.isGlobalAdmin))
    .map((u) => ({
      value: u.email,
      label: lacksScope(u.email, scopeId)
        ? `${personLabel(u.email)} · ${lacksScopeLabel(bulk)}`
        : personLabel(u.email),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const anyoneCanViewLabel = () =>
  t3({
    en: "Anyone in this instance can view",
    fr: "Tout le monde dans cette instance peut consulter",
    pt: "Qualquer pessoa nesta instância pode ver",
  });

const anyoneCanEditLabel = () =>
  t3({
    en: "Anyone in this instance can edit",
    fr: "Tout le monde dans cette instance peut modifier",
    pt: "Qualquer pessoa nesta instância pode editar",
  });

const generalAccessLabel = () =>
  t3({ en: "General access", fr: "Accès général", pt: "Acesso geral" });

const peopleLabel = () =>
  t3({
    en: "People with access",
    fr: "Personnes ayant accès",
    pt: "Pessoas com acesso",
  });

const addPersonLabel = () =>
  t3({
    en: "Add a person…",
    fr: "Ajouter une personne…",
    pt: "Adicionar uma pessoa…",
  });

const saveLabel = () => t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" });

const levelOptions = (): SelectOption<ProductGrantLevel>[] => [
  {
    value: "view",
    label: t3({ en: "Can view", fr: "Peut consulter", pt: "Pode ver" }),
  },
  {
    value: "edit",
    label: t3({ en: "Can edit", fr: "Peut modifier", pt: "Pode editar" }),
  },
];

// One person in a list: their name, the scope mark, then the row's controls.
function PersonRow(p: {
  email: string;
  scopeId: ScopeId | undefined;
  bulk: boolean;
  children: JSX.Element;
}) {
  return (
    <div class="ui-gap-sm ui-pad-sm flex items-center border-b last:border-b-0">
      <div class="min-w-0 flex-1">
        <div class="truncate">{personLabel(p.email)}</div>
        <Show when={lacksScope(p.email, p.scopeId)}>
          <div class="text-base-content-muted text-xs">
            {lacksScopeLabel(p.bulk)}
          </div>
        </Show>
      </div>
      {p.children}
    </div>
  );
}

function GrantRows(p: {
  grants: ProductGrant[];
  scopeId: ScopeId | undefined;
  bulk: boolean;
  onLevel: (email: string, level: ProductGrantLevel) => void;
  onRemove?: (email: string) => void;
}) {
  return (
    <For each={p.grants}>
      {(grant) => (
        <PersonRow email={grant.email} scopeId={p.scopeId} bulk={p.bulk}>
          <Select
            size="sm"
            options={levelOptions()}
            value={grant.level}
            onChange={(level) =>
              p.onLevel(grant.email, level)}
          />
          <Show when={p.onRemove}>
            {(onRemove) => (
              <Button
                size="sm"
                outline
                iconName="x"
                ariaLabel={t3({
                  en: "Remove access",
                  fr: "Retirer l'accès",
                  pt: "Remover o acesso",
                })}
                onClick={() => onRemove()(grant.email)}
              />
            )}
          </Show>
        </PersonRow>
      )}
    </For>
  );
}

function setLevel(
  grants: ProductGrant[],
  email: string,
  level: ProductGrantLevel,
): ProductGrant[] {
  return grants.map((g) => (g.email === email ? { email, level } : g));
}

function ProductAccessForm(p: {
  productId: string;
  close: () => void;
  done: () => void;
}) {
  const product = () => productById(p.productId);
  const stored: ProductAccess = {
    owner: product()?.owner ?? null,
    defaultAccess: product()?.defaultAccess ?? "none",
    grants: product()?.grants ?? [],
  };
  const [tempOwner, setTempOwner] = createSignal(stored.owner);
  const [tempDefaultAccess, setTempDefaultAccess] = createSignal<
    ProductDefaultAccess
  >(stored.defaultAccess);
  const [tempGrants, setTempGrants] = createSignal<ProductGrant[]>(
    stored.grants,
  );
  const [choosingOwner, setChoosingOwner] = createSignal(false);

  const scopeId = () => product()?.scopeId;
  const draft = (): ProductAccess => ({
    owner: tempOwner(),
    defaultAccess: tempDefaultAccess(),
    grants: tempGrants(),
  });

  function pickOwner(email: string) {
    const next = withOwner(draft(), email);
    setTempOwner(next.owner);
    setTempGrants(next.grants);
    setChoosingOwner(false);
  }

  const ownerOptions = createMemo(() =>
    candidateOptions(
      new Set(tempOwner() === null ? [] : [tempOwner()!]),
      scopeId(),
      false,
      true,
    )
  );
  const personOptions = createMemo(() =>
    candidateOptions(
      new Set([
        ...(tempOwner() === null ? [] : [tempOwner()!]),
        ...tempGrants().map((g) => g.email),
      ]),
      scopeId(),
      false,
      false,
    )
  );

  const save = createFormAction(
    async (): Promise<APIResponseNoData> => {
      const owner = tempOwner();
      const transfers = owner !== null && owner !== stored.owner;
      if (transfers) {
        const res = await serverActions.setProductOwner({
          product_id: p.productId,
          email: owner,
        });
        if (!res.success) return res;
      }
      const afterTransfer = transfers ? withOwner(stored, owner) : stored;
      if (!sameAccess(draft(), afterTransfer)) {
        const res = await serverActions.setProductAccess({
          product_id: p.productId,
          defaultAccess: tempDefaultAccess(),
          grants: tempGrants(),
        });
        if (!res.success) return res;
      }
      return { success: true };
    },
    () => p.done(),
  );

  const defaultAccessOptions = (): SelectOption<ProductDefaultAccess>[] => [
    {
      value: "none",
      label: t3({ en: "Restricted", fr: "Restreint", pt: "Restrito" }),
    },
    { value: "view", label: anyoneCanViewLabel() },
    { value: "edit", label: anyoneCanEditLabel() },
  ];

  return (
    <ModalContainer
      title={t3({
        en: "Manage access",
        fr: "Gérer l'accès",
        pt: "Gerir o acesso",
      })}
      subtitle={product()?.label}
      width="md"
      onCancel={p.close}
      actions={[{
        label: saveLabel(),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <div class="ui-spy">
        <div class="ui-spy-sm">
          <Select
            label={generalAccessLabel()}
            options={defaultAccessOptions()}
            value={tempDefaultAccess()}
            onChange={setTempDefaultAccess}
            fullWidth
          />
          <div class="text-base-content-muted text-sm">
            {tempDefaultAccess() === "none"
              ? t3({
                en:
                  "Only the owner, the people below and administrators can open it.",
                fr:
                  "Seuls le propriétaire, les personnes ci-dessous et les administrateurs peuvent l'ouvrir.",
                pt:
                  "Apenas o proprietário, as pessoas abaixo e os administradores podem abri-lo.",
              })
              : t3({
                en:
                  "Everyone in this instance has at least this access. A person below can be given more, never less.",
                fr:
                  "Tout le monde dans cette instance a au moins cet accès. Une personne ci-dessous peut en recevoir plus, jamais moins.",
                pt:
                  "Todas as pessoas nesta instância têm pelo menos este acesso. Uma pessoa abaixo pode receber mais, nunca menos.",
              })}
          </div>
        </div>
        <Field label={peopleLabel()} fullWidth>
          <div class="rounded border">
            <Show
              when={tempOwner()}
              fallback={
                <div class="ui-gap-sm ui-pad-sm flex items-center border-b">
                  <div class="text-base-content-muted flex-1">
                    {t3({
                      en: "No owner",
                      fr: "Aucun propriétaire",
                      pt: "Sem proprietário",
                    })}
                  </div>
                  <Show when={canOwnProduct(p.productId) && !choosingOwner()}>
                    <Button
                      size="sm"
                      outline
                      onClick={() => setChoosingOwner(true)}
                    >
                      {t3({
                        en: "Set owner…",
                        fr: "Définir le propriétaire…",
                        pt: "Definir o proprietário…",
                      })}
                    </Button>
                  </Show>
                </div>
              }
            >
              {(owner) => (
                <PersonRow email={owner()} scopeId={scopeId()} bulk={false}>
                  <span class="text-base-content-muted text-sm">
                    {t3({
                      en: "Owner",
                      fr: "Propriétaire",
                      pt: "Proprietário",
                    })}
                  </span>
                  <Show when={canOwnProduct(p.productId) && !choosingOwner()}>
                    <Button
                      size="sm"
                      outline
                      onClick={() =>
                        setChoosingOwner(true)}
                    >
                      {t3({
                        en: "Transfer ownership…",
                        fr: "Transférer la propriété…",
                        pt: "Transferir a propriedade…",
                      })}
                    </Button>
                  </Show>
                </PersonRow>
              )}
            </Show>
            <Show when={choosingOwner()}>
              <div class="ui-spy-sm ui-pad-sm border-b">
                <SelectSearch
                  value={undefined}
                  options={ownerOptions()}
                  onChange={pickOwner}
                  placeholder={t3({
                    en: "Choose the new owner…",
                    fr: "Choisir le nouveau propriétaire…",
                    pt: "Escolher o novo proprietário…",
                  })}
                  fullWidth
                />
                <div class="text-base-content-muted text-xs">
                  {t3({
                    en:
                      "Ownership moves when you save. The previous owner keeps edit access.",
                    fr:
                      "La propriété est transférée à l'enregistrement. L'ancien propriétaire garde l'accès en modification.",
                    pt:
                      "A propriedade é transferida ao guardar. O proprietário anterior mantém o acesso de edição.",
                  })}
                </div>
              </div>
            </Show>
            <div class="ui-pad-sm text-base-content-muted border-b">
              {t3({
                en: "Administrators: full access",
                fr: "Administrateurs : accès complet",
                pt: "Administradores: acesso total",
              })}
            </div>
            <GrantRows
              grants={tempGrants()}
              scopeId={scopeId()}
              bulk={false}
              onLevel={(email, level) =>
                setTempGrants(setLevel(tempGrants(), email, level))}
              onRemove={(email) =>
                setTempGrants(tempGrants().filter((g) => g.email !== email))}
            />
          </div>
        </Field>
        <SelectSearch
          value={undefined}
          options={personOptions()}
          onChange={(email) =>
            setTempGrants([...tempGrants(), { email, level: "view" }])}
          placeholder={addPersonLabel()}
          fullWidth
        />
      </div>
    </ModalContainer>
  );
}

function FolderAccessForm(p: {
  folderId: string;
  close: () => void;
  done: () => void;
}) {
  const [tempDefaultAccess, setTempDefaultAccess] = createSignal<
    ProductDefaultAccess
  >("none");
  const [tempGrants, setTempGrants] = createSignal<ProductGrant[]>([]);

  const folder = () => instanceState.folders.find((f) => f.id === p.folderId);
  const productCount = createMemo(() => {
    const inside = descendantIds(instanceState.folders, p.folderId);
    inside.add(p.folderId);
    return instanceState.products.filter((product) =>
      product.folderId !== null && inside.has(product.folderId)
    ).length;
  });

  const personOptions = createMemo(() =>
    candidateOptions(
      new Set(tempGrants().map((g) => g.email)),
      undefined,
      true,
      false,
    )
  );

  const nothingChosen = () =>
    tempDefaultAccess() === "none" && tempGrants().length === 0;

  const save = createFormAction(
    async (): Promise<APIResponseNoData> => {
      const res = await serverActions.setFolderProductsAccess({
        folder_id: p.folderId,
        defaultAccess: tempDefaultAccess(),
        grants: tempGrants(),
      });
      if (!res.success) return res;
      return { success: true };
    },
    () => p.done(),
  );

  const defaultAccessOptions = (): SelectOption<ProductDefaultAccess>[] => [
    {
      value: "none",
      label: t3({
        en: "Leave as is",
        fr: "Laisser tel quel",
        pt: "Deixar como está",
      }),
    },
    { value: "view", label: anyoneCanViewLabel() },
    { value: "edit", label: anyoneCanEditLabel() },
  ];

  return (
    <ModalContainer
      title={t3({
        en: "Set access for everything in this folder",
        fr: "Définir l'accès pour tout le contenu de ce dossier",
        pt: "Definir o acesso para todo o conteúdo desta pasta",
      })}
      subtitle={folder()?.label}
      width="md"
      onCancel={p.close}
      actions={[{
        label: saveLabel(),
        onClick: save.click,
        state: save.state(),
        disabled: nothingChosen(),
      }]}
    >
      <div class="ui-spy">
        <div class="text-sm">
          {t3({
            en:
              `This changes the ${productCount()} product(s) in this folder and its subfolders now. It only raises access: nothing is lowered or removed, each product's owner stays its owner, and products added to the folder later are not changed.`,
            fr:
              `Cela modifie dès maintenant les ${productCount()} produit(s) de ce dossier et de ses sous-dossiers. L'accès est seulement élevé : rien n'est abaissé ni retiré, chaque produit garde son propriétaire, et les produits ajoutés plus tard au dossier ne sont pas modifiés.`,
            pt:
              `Isto altera agora os ${productCount()} produto(s) desta pasta e das suas subpastas. O acesso só é aumentado: nada é reduzido nem removido, cada produto mantém o seu proprietário, e os produtos adicionados mais tarde à pasta não são alterados.`,
          })}
        </div>
        <Select
          label={generalAccessLabel()}
          options={defaultAccessOptions()}
          value={tempDefaultAccess()}
          onChange={setTempDefaultAccess}
          fullWidth
        />
        <Field label={peopleLabel()} fullWidth>
          <Show
            when={tempGrants().length > 0}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "No one added",
                  fr: "Personne n'a été ajouté",
                  pt: "Ninguém adicionado",
                })}
              </div>
            }
          >
            <div class="rounded border">
              <GrantRows
                grants={tempGrants()}
                scopeId={undefined}
                bulk
                onLevel={(email, level) =>
                  setTempGrants(setLevel(tempGrants(), email, level))}
              />
            </div>
          </Show>
        </Field>
        <SelectSearch
          value={undefined}
          options={personOptions()}
          onChange={(email) =>
            setTempGrants([...tempGrants(), { email, level: "view" }])}
          placeholder={addPersonLabel()}
          fullWidth
        />
      </div>
    </ModalContainer>
  );
}
