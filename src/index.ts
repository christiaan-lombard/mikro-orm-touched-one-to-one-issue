import { MikroORM } from "@mikro-orm/sqlite";
import {
  Entity,
  FlushMode,
  OneToOne,
  OptionalProps,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";

@Entity()
class Blog {
  @PrimaryKey()
  id!: number;

  @Property({ length: 64, nullable: true })
  title: string | null = null;

  // Note the OneToOne relationship with inverse
  @OneToOne(() => "User", (e: User) => e.blog, { owner: true })
  author!: any;
}

@Entity()
class User {
  [OptionalProps]!: "createdAt" | "updatedAt" | "balance" | "blog" | "version";

  @PrimaryKey()
  id!: number;

  @Property({ length: 64, nullable: false, default: "Default" })
  name: string = "Default";

  @Property()
  balance: number = 0;

  // Note the OneToOne relationship with inverse
  @OneToOne(() => "Blog", (e: Blog) => e.author)
  blog!: Blog;
}

async function runTest() {
  const orm = await MikroORM.init({
    dbName: "test.db",
    port: 33070,
    forceEntityConstructor: true,
    entities: [Blog, User],
    allowGlobalContext: true,
    debug: true,
    validateRequired: false,
    validate: false,
    strict: false,
    flushMode: FlushMode.COMMIT,
  });

  await orm.schema.dropSchema();
  await orm.schema.createSchema();

  const id = 1;

  const author = orm.em.create(User, {
    id,
    name: "Some User",
    balance: 5000,
  });

  orm.em.create(Blog, {
    id,
    title: "Test Blog",
    author,
  });

  await orm.em.flush();
  // begin
  // insert into `user` (`id`, `name`, `balance`) values (1, 'Some User', 5000) returning `id`, `name`, `balance`
  // insert into `blog` (`id`, `title`, `author_id`) values (1, 'Test Blog', 1) returning `id`
  // commit
  orm.em.clear();

  const entity = await orm.em.findOneOrFail(Blog, { id });
  // select `b0`.* from `blog` as `b0` where `b0`.`id` = 1

  const work = orm.em.getUnitOfWork();
  await work.computeChangeSets();

  // BUG: entity.author is marked as touched!!
  console.log(entity.author.__helper.__touched); // = true

  const changes = work.getChangeSets();
  console.log(changes[0].payload); // {name: 'Default', balance: 0}

  await orm.em.flush();
  // NOOOO!! ENTITY IS RESET TO DEFAULT VALUES !!!!!!!
  // begin
  // update `user` set `name` = 'Default', `balance` = 0 where `id` = 1
  // commit

  await orm.close();
}

runTest().then(() => console.log("done"), console.error);
