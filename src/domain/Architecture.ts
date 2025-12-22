import { z } from 'zod';

export const ArchitectureSchema = z.object({
    overview: z.string(),
    fileStructure: z.string(),
    components: z.string(),
    details: z.string(),
});

export type ArchitectureData = z.infer<typeof ArchitectureSchema>;

export class Architecture {
    constructor(public readonly data: ArchitectureData, public readonly raw: string) { }

    public get content(): string {
        return this.raw;
    }

    public static fromMarkdown(md: string): Architecture {
        const sections: Partial<ArchitectureData> = {
            overview: '',
            fileStructure: '',
            components: '',
            details: ''
        };

        const overviewMatch = md.match(/## 1\. Solution Overview([\s\S]*?)(?=##|$)/i);
        const fileStructureMatch = md.match(/## 2\. Proposed File Structure([\s\S]*?)(?=##|$)/i);
        const componentsMatch = md.match(/## 3\. Key Components & Contracts([\s\S]*?)(?=##|$)/i);
        const detailsMatch = md.match(/## 4\. Implementation Details([\s\S]*?)(?=##|$)/i);

        sections.overview = overviewMatch ? overviewMatch[1].trim() : '';
        sections.fileStructure = fileStructureMatch ? fileStructureMatch[1].trim() : '';
        sections.components = componentsMatch ? componentsMatch[1].trim() : '';
        sections.details = detailsMatch ? detailsMatch[1].trim() : '';

        // Fallback if no sections found to maintain backward compatibility or handle poor LLM output
        if (!sections.overview && !sections.fileStructure && !sections.components && !sections.details) {
            sections.overview = md;
        }

        const data = ArchitectureSchema.parse(sections);
        return new Architecture(data, md);
    }

    public toString(): string {
        return this.raw;
    }
}
