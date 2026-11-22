import {
  STANDARD_ROLES,
  assertCan,
  can,
  type Actor,
  type Deed,
  type DutyRule,
  type Entity,
  type Permission,
  type Role,
} from "@booki/core/permissions";
import { createContext, useContext, useMemo, type ReactNode } from "react";

export type BookiAccess = {
  actor: Actor | undefined;
  entity: Entity | undefined;
  can: (permission: Permission) => boolean;
  /** Why this person may not, as a sentence. Undefined when they may. */
  why: (permission: Permission, deeds?: Deed[]) => string | undefined;
};

const BookiAccessContext = createContext<BookiAccess | null>(null);

export type BookiAccessProviderProps = {
  /** The person at the keyboard. */
  actor?: Actor;
  /** Defaults to `STANDARD_ROLES` from `@booki/core/permissions`. */
  roles?: Role[];
  /** The company being worked in. An actor limited to other entities is refused. */
  entity?: Entity;
  /** Pairs of things one person may not both do on the same item. */
  dutyRules?: DutyRule[];
  children: ReactNode;
};

/**
 * Who is signed in, what their roles allow, and which company they are in.
 * Inside it, the workflow controls take the actor from here and refuse a
 * person's button their role does not allow, saying which role it takes.
 * Your backend still has to check: this is the screen's half.
 */
function BookiAccessProvider({ actor, roles = STANDARD_ROLES, entity, dutyRules, children }: BookiAccessProviderProps) {
  const value = useMemo<BookiAccess>(
    () => ({
      actor,
      entity,
      can: (permission) => can(actor, roles, permission, { entity: entity?.id }),
      why: (permission, deeds) => {
        try {
          assertCan(actor, roles, permission, { entity: entity?.id, deeds, dutyRules });
          return undefined;
        } catch (error) {
          return (error as Error).message;
        }
      },
    }),
    [actor, roles, entity, dutyRules],
  );
  return <BookiAccessContext.Provider value={value}>{children}</BookiAccessContext.Provider>;
}

/** The access context, or null when there is no provider (then nothing is refused by role). */
function useBookiAccess(): BookiAccess | null {
  return useContext(BookiAccessContext);
}

/**
 * For a control: the actor id to record decisions under, and the person's
 * methods their role does not allow, each with the reason.
 */
function useAccessFor(
  methods: Record<string, Permission>,
  explicitActor?: string,
): { actor: string | undefined; denied: Record<string, string> | undefined } {
  const access = useBookiAccess();
  return useMemo(() => {
    if (!access) return { actor: explicitActor, denied: undefined };
    const denied: Record<string, string> = {};
    for (const [method, permission] of Object.entries(methods)) {
      const reason = access.why(permission);
      if (reason) denied[method] = reason;
    }
    return {
      actor: explicitActor ?? access.actor?.id,
      denied: Object.keys(denied).length > 0 ? denied : undefined,
    };
    // `methods` is a literal at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, explicitActor]);
}

export { BookiAccessProvider, useBookiAccess, useAccessFor };
export { refuseDenied } from "@booki/primitives/access";
export type { Actor, Deed, DutyRule, Entity, Permission, Role };
