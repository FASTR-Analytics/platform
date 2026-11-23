import { t3 } from "lib";
import { plural } from "panther";

// The wording every team screen shares: counts of people and products, and
// the two sentences that say what a membership change or a delete does.

export function peopleCountText(count: number): string {
  return plural(count, {
    one: t3({
      en: `${count} person`,
      fr: `${count} personne`,
      pt: `${count} pessoa`,
    }),
    other: t3({
      en: `${count} people`,
      fr: `${count} personnes`,
      pt: `${count} pessoas`,
    }),
  });
}

export function memberCountText(count: number): string {
  return plural(count, {
    one: t3({
      en: `${count} member`,
      fr: `${count} membre`,
      pt: `${count} membro`,
    }),
    other: t3({
      en: `${count} members`,
      fr: `${count} membres`,
      pt: `${count} membros`,
    }),
  });
}

export function productCountText(count: number): string {
  return plural(count, {
    one: t3({
      en: `${count} product`,
      fr: `${count} produit`,
      pt: `${count} produto`,
    }),
    other: t3({
      en: `${count} products`,
      fr: `${count} produits`,
      pt: `${count} produtos`,
    }),
  });
}

// What joining a team hands a person: said before a save that adds people to
// a team that products already grant a level.
export function joiningGivesAccessText(
  peopleCount: number,
  productCount: number,
): string {
  const people = peopleCountText(peopleCount);
  const products = productCountText(productCount);
  return plural(peopleCount, {
    one: t3({
      en: `Adding ${people} gives them access to ${products}.`,
      fr: `L'ajout de ${people} lui donne accès à ${products}.`,
      pt: `Adicionar ${people} dá-lhe acesso a ${products}.`,
    }),
    other: t3({
      en: `Adding ${people} gives them access to ${products}.`,
      fr: `L'ajout de ${people} leur donne accès à ${products}.`,
      pt: `Adicionar ${people} dá-lhes acesso a ${products}.`,
    }),
  });
}

// What deleting a team takes away, or a plain question when it gives nothing.
export function deleteTeamText(
  label: string,
  memberCount: number,
  productCount: number,
): string {
  if (memberCount === 0 || productCount === 0) {
    return t3({
      en: `Are you sure you want to delete the team "${label}"?`,
      fr: `Êtes-vous sûr de vouloir supprimer l'équipe « ${label} » ?`,
      pt: `Tem a certeza de que pretende eliminar a equipa "${label}"?`,
    });
  }
  const people = peopleCountText(memberCount);
  const products = productCountText(productCount);
  return t3({
    en:
      `The team "${label}" gives ${people} access to ${products}. Deleting it removes that access.`,
    fr:
      `L'équipe « ${label} » donne à ${people} l'accès à ${products}. La supprimer retire cet accès.`,
    pt:
      `A equipa "${label}" dá a ${people} acesso a ${products}. Eliminá-la remove esse acesso.`,
  });
}

export const teamsLabel = () =>
  t3({ en: "Teams", fr: "Équipes", pt: "Equipas" });

export const administratorFullAccessLabel = () =>
  t3({
    en: "Administrator: already has full access",
    fr: "Administrateur : a déjà un accès complet",
    pt: "Administrador: já tem acesso total",
  });
