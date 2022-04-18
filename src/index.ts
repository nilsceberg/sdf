import * as fs from "fs";

type TransformFunction = (expr: string) => string;
const identity = <T>(x: T) => x;

const compose = (f: TransformFunction, g: TransformFunction) => (expr: string) => g(f(expr));

const float = (x: number) => {
    const str = x.toString();
    if (str.indexOf(".") !== -1) return str;
    else return str + ".0";
}

interface Output {
    pushIndent(n: number): void;
    popIndent(n: number): void;
    write(line: string): void;
}

class ConsoleOutput implements Output {
    private indent: number = 0;

    pushIndent(n: number): void {
        this.indent += n;
    }

    popIndent(n: number): void {
        this.indent -= n;
    }

    write(line: string) {
        console.log("\t".repeat(this.indent) + line);
    }
}

abstract class Scene {
    private static nextId: number = 0;
    private id: number;

    constructor() {
        this.id = Scene.nextId++;
    }

    identifier(): string {
        return `sdf${this.id}`;
    }

    protected writeSdf(output: Output, expr: string) {
        output.write(`float ${this.identifier()} = ${expr};`)
    }

    abstract compile(transformer: TransformFunction, output: Output): void;
}

abstract class Transform extends Scene {
    scene: Scene;

    constructor(scene: Scene) {
        super();
        this.scene = scene;
    }

    override identifier(): string {
        return this.scene.identifier();
    }

    override compile(transformer: TransformFunction, output: Output): void {
        this.scene.compile(compose(this.transformer(), transformer), output);
    }

    abstract transformer(): TransformFunction;
}

class Translate extends Transform {
    translate: Vec3;

    constructor(translate: Vec3, scene: Scene)  {
        super(scene);
        this.translate = translate;
    }

    override transformer(): TransformFunction {
        return expr => `(${expr} + ${this.translate.compile()})`;
    }
}

class Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;

    static Origin = new Vec3(0, 0, 0);

    constructor(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    compile(): string {
        return `vec3(${float(this.x)}, ${float(this.y)}, ${float(this.z)})`;
    }
}

abstract class Shape extends Scene {
    abstract override compile(transformer: TransformFunction, output: Output): void;
}

abstract class Operator extends Scene {
    readonly scenes: Scene[];

    constructor(scenes: Scene[]) {
        super();
        this.scenes = scenes;
    }

    abstract override compile(transformer: TransformFunction, output: Output): void;
}

abstract class BinaryOperator extends Operator {
    override compile(transformer: TransformFunction, output: Output): void {
        for (let scene of this.scenes) {
            scene.compile(transformer, output);
        }

        this.writeSdf(output, `${this.scenes.slice(1).reduce(
            (expr, scene) => this.compileBinary(expr, scene, transformer),
            this.scenes[0].identifier()
        )}`);
    }

    protected abstract compileBinary(expr: string, scene: Scene, transformer: TransformFunction): string;
}

class Sphere extends Shape {
    radius: number;

    constructor(radius: number) {
        super();
        this.radius = radius;
    }

    override compile(transformer: TransformFunction, output: Output): void {
        this.writeSdf(output, `length(point - ${transformer(Vec3.Origin.compile())}) - ${this.radius}`);
    }
}

class Union extends BinaryOperator {
    smoothing: number;

    constructor(smoothing: number, shapes: Shape[]) {
        super(shapes);
        this.smoothing = smoothing;
    }

    protected override compileBinary(expr: string, shape: Shape, transformer: TransformFunction): string {
        return `smin(${expr}, ${shape.identifier()}, ${this.smoothing})`;
    }
}

class Compiler {
    private loadTemplate(): string[] {
        return fs.readFileSync("src/glsl/main.frag", 'utf-8').split("\n");
    }

    private checkTemplateString(line: string): [string | null, number] {
        const match = line.match(/^(\t*)#include\s+<(\w+)>\s*$/);
        if (match) {
            return [match[2], match[1].length];
        }
        else {
            return [null, 0];
        }
    }

    private replace(output: Output, templateString: string, scene: Scene) {
        switch (templateString) {
            case "sdf":
                scene.compile(identity, output);
                output.write(`float sdf = ${scene.identifier()};`);
                return;
            default:
                output.write("/* unknown template string */");
                return;
        }
    }

    private processTemplateLine(output: Output, line: string, scene: Scene) {
        const [templateString, indent] = this.checkTemplateString(line);
        
        if (templateString) {
            output.pushIndent(indent);
            this.replace(output, templateString, scene);
            output.popIndent(indent);
        }
        else {
            output.write(line);
        }
    }

    compile(output: Output, scene: Scene) {
        const template = this.loadTemplate();
        for (const line of template) {
            this.processTemplateLine(output, line, scene);
        }
    }
}

function main() {
    const scene = (
        new Translate(
            new Vec3(0, 0, 2),
            new Union(0.2,
                [
                    new Sphere(0.2),
                    new Translate(
                        new Vec3(0.4, 0.2, 0.0),
                        new Sphere(0.5),
                    ),
                ]
            )
        )
    );

    const compiler = new Compiler();
    const output = new ConsoleOutput();

    compiler.compile(output, scene);
}

main();
