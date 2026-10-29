export interface StoredProxy {
    id: string;
    cardName: string;
    scryfallId: string;
    scryfallUrl: string;
    originalImageUrl: string;
    occurredAt: string;
    artwork: {
        file: "artwork.webp";
        alt: string;
        caption?: string;
        sha256: string;
        width: number;
        height: number;
    };
    title?: string;
    summary?: string;
    notes?: string;
    tags: string[];
    status: "active" | "archived";
    createdAt: string;
    updatedAt: string;
}
export interface CreateProxyInput {
    sourcePath: string;
    cardName: string;
    alt: string;
    caption?: string;
    occurredAt?: string;
    title?: string;
    summary?: string;
    notes?: string;
    tags?: string[];
    id?: string;
}
export declare function resolveProxyRoot(stateDir: string, configured?: string): string;
export declare class ProxyStore {
    private readonly root;
    private readonly resolveCard;
    constructor(root: string, resolveCard?: (name: string) => Promise<any>);
    private recordRoot;
    create(input: CreateProxyInput): Promise<StoredProxy>;
    get(id: string): Promise<StoredProxy & {
        artworkPath: string;
    }>;
    list(includeArchived?: boolean): Promise<StoredProxy[]>;
    update(id: string, patch: Partial<Pick<CreateProxyInput, "alt" | "caption" | "title" | "summary" | "notes" | "tags">> & {
        sourcePath?: string;
    }): Promise<StoredProxy>;
    archive(id: string): Promise<StoredProxy>;
}
