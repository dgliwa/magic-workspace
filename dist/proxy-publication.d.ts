export interface ProxyManifest {
    cardName: string;
    occurredAt: string;
    artwork: {
        file: string;
        alt: string;
        caption?: string;
    };
    title?: string;
    summary?: string;
    notes?: string;
    tags?: string[];
    status?: "active" | "archived";
    scryfallId?: string;
    scryfallUrl?: string;
    originalImageUrl?: string;
}
export interface ProxyPublicationProjection {
    projectionVersion: 1;
    source: {
        system: "magic-proxy";
        recordId: string;
        version: string;
    };
    occurredAt: string;
    fields: {
        title: string;
        summary: string;
        cardName: string;
        scryfallUrl: string;
        originalImageUrl: string;
        notes?: string;
        tags: string[];
    };
    optInFields: Record<string, never>;
    media: Array<{
        id: "proxy-artwork";
        path: string;
        mimeType: "image/jpeg" | "image/png" | "image/webp";
        altHint: string;
        caption?: string;
    }>;
}
export declare function projectMagicProxy(root: string, recordId: string, resolveCard?: (name: string) => Promise<any>): Promise<ProxyPublicationProjection>;
