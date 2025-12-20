export interface Skill {
    name: string;
    description?: string;
    prompt_template?: string;
    command?: string;
    args?: string[];
    [key: string]: any;
}
